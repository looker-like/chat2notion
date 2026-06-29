import {
  ASSISTANT_PROCESSED_ATTRIBUTE,
  AUTO_ICON,
  AUTO_SYNC_STABILITY_MS,
  AUTO_SYNCED_ATTRIBUTE,
  CONFIG_STORAGE_KEY,
  CONVERSATION_AUTO_SYNC_STORAGE_KEY,
  CONTROL_ATTRIBUTE,
  MIN_AUTO_SYNC_ANSWER_LENGTH,
  OBSERVER_DEBOUNCE_MS,
} from "./constants";
import type { ChatPair, ControlNodes } from "./types";
import { createConversationKey, readConversationAutoSyncState } from "./messages";
import { buildChatPair, getAssistantMessages, isAnswerStillStreaming } from "./platform";
import { createRuntimeClient } from "./runtime";
import { handleManualSync, initializeSyncedState, syncPair } from "./sync";
import {
  createControl,
  ensureStyles,
  findExistingControl,
  findInsertionTarget,
  openNotionPage,
  readControl,
  removeDuplicateControls,
  setControlState,
  setControlStatus,
  syncOpenButton,
} from "./controls";

(() => {
  let autoSyncEnabled = false;
  let conversationAutoSyncEnabled = false;
  let conversationKey = createConversationKey();
  let scanTimer: number | null = null;
  let observer: MutationObserver | null = null;
  const autoSyncTimers = new Map<string, number>();
  const runtime = createRuntimeClient(handleExtensionContextInvalidated);

  void initialize();

  async function initialize(): Promise<void> {
    ensureStyles();
    await refreshConfig();
    await refreshConversationAutoSync();
    scanPage();
    observeChat();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[CONFIG_STORAGE_KEY]) {
        return;
      }

      void refreshConfig().then(() => scheduleScan(100));
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[CONVERSATION_AUTO_SYNC_STORAGE_KEY]) {
        return;
      }

      void refreshConversationAutoSync().then(() => scheduleScan(100));
    });

    window.addEventListener("popstate", () => {
      void handleLocationChanged();
    });

    window.setInterval(() => {
      if (conversationKey !== createConversationKey()) {
        void handleLocationChanged();
      }
    }, 1000);
  }

  async function refreshConfig(): Promise<void> {
    const response = await runtime.sendMessage({ type: "chat2notion:getConfig" });

    if (response.ok && "config" in response) {
      autoSyncEnabled = response.config.autoSyncEnabled;
    }
  }

  async function refreshConversationAutoSync(): Promise<void> {
    const stored = await runtime.safeStorageGet(CONVERSATION_AUTO_SYNC_STORAGE_KEY);
    const state = readConversationAutoSyncState(stored[CONVERSATION_AUTO_SYNC_STORAGE_KEY]);
    conversationAutoSyncEnabled = Boolean(state[conversationKey]);
  }

  async function handleLocationChanged(): Promise<void> {
    conversationKey = createConversationKey();
    await refreshConversationAutoSync();
    scheduleScan(100);
  }

  function observeChat(): void {
    observer?.disconnect();
    observer = new MutationObserver(() => scheduleScan(OBSERVER_DEBOUNCE_MS));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function scheduleScan(delay: number): void {
    if (!runtime.isValid()) {
      return;
    }

    if (scanTimer !== null) {
      // Do not delay an already scheduled scan
      return;
    }

    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scanPage();
    }, delay);
  }

  function scanPage(): void {
    getAssistantMessages().forEach((assistant) => {
      const pair = buildChatPair(assistant);

      if (!pair) {
        return;
      }

      ensureControl(pair);

      if (autoSyncEnabled || conversationAutoSyncEnabled) {
        scheduleAutoSync(pair);
      }
    });
  }

  function ensureControl(pair: ChatPair): void {
    pair.assistant.setAttribute(ASSISTANT_PROCESSED_ATTRIBUTE, "true");

    const insertionTarget = findInsertionTarget(pair.assistant);
    const existing = findExistingControl(pair.assistant, insertionTarget, pair.messageId);
    const control = existing ? readControl(existing) : createControl(pair);

    if (!existing) {
      insertionTarget.append(control.root);
    }

    removeDuplicateControls(insertionTarget, control.root);
    control.root.dataset.messageId = pair.messageId;
    control.button.onclick = () => {
      const latestPair = buildChatPair(pair.assistant) || pair;
      void handleManualSync(latestPair, control, runtime);
    };
    control.openButton.onclick = () => {
      openNotionPage(control);
    };
    control.autoButton.onclick = () => {
      const latestPair = buildChatPair(pair.assistant) || pair;
      void toggleConversationAutoSync(latestPair, control);
    };
    syncConversationAutoButton(control);
    syncOpenButton(control);

    void initializeSyncedState(pair.messageId, control, runtime);
  }

  async function toggleConversationAutoSync(pair: ChatPair, control: ControlNodes): Promise<void> {
    const nextEnabled = !conversationAutoSyncEnabled;
    const saved = await setConversationAutoSync(nextEnabled);

    if (!saved) {
      setControlState(control, "error", "Extension was reloaded. Refresh this AI chat tab.");
      return;
    }

    conversationAutoSyncEnabled = nextEnabled;
    syncAllConversationAutoButtons();

    if (!nextEnabled) {
      setControlStatus(control, "Conversation auto-save off.");
      return;
    }

    setControlStatus(control, "Conversation auto-save on. Future answers will sync.");

    if (control.root.dataset.state !== "synced") {
      await syncPair(pair, control, "auto", runtime);
    }

    scheduleScan(100);
  }

  async function setConversationAutoSync(enabled: boolean): Promise<boolean> {
    const stored = await runtime.safeStorageGet(CONVERSATION_AUTO_SYNC_STORAGE_KEY);

    if (!runtime.isValid()) {
      return false;
    }

    const state = readConversationAutoSyncState(stored[CONVERSATION_AUTO_SYNC_STORAGE_KEY]);

    if (enabled) {
      state[conversationKey] = {
        enabled: true,
        sourceUrl: location.href,
        updatedAt: new Date().toISOString(),
      };
    } else {
      delete state[conversationKey];
    }

    return runtime.safeStorageSet({ [CONVERSATION_AUTO_SYNC_STORAGE_KEY]: state });
  }

  function syncAllConversationAutoButtons(): void {
    document.querySelectorAll<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`).forEach((root) => {
      syncConversationAutoButton(readControl(root));
    });
  }

  function syncConversationAutoButton(control: ControlNodes): void {
    control.autoButton.innerHTML = AUTO_ICON;
    control.autoButton.dataset.enabled = conversationAutoSyncEnabled ? "true" : "false";
    control.autoButton.title = conversationAutoSyncEnabled
      ? "Disable automatic Notion sync for this AI conversation."
      : "Enable automatic Notion sync for this AI conversation.";
  }

  function scheduleAutoSync(pair: ChatPair): void {
    if (pair.assistant.getAttribute(AUTO_SYNCED_ATTRIBUTE) === pair.messageId) {
      return;
    }

    if (pair.answer.length < MIN_AUTO_SYNC_ANSWER_LENGTH || isAnswerStillStreaming(pair.assistant)) {
      scheduleScan(AUTO_SYNC_STABILITY_MS);
      return;
    }

    const previousTimer = autoSyncTimers.get(pair.messageId);

    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }

    const timer = window.setTimeout(() => {
      autoSyncTimers.delete(pair.messageId);
      const latestPair = buildChatPair(pair.assistant);

      if (!latestPair || latestPair.messageId !== pair.messageId || isAnswerStillStreaming(pair.assistant)) {
        scheduleScan(AUTO_SYNC_STABILITY_MS);
        return;
      }

      const controlRoot = findExistingControl(pair.assistant, findInsertionTarget(pair.assistant), pair.messageId);

      if (!controlRoot) {
        return;
      }

      void syncPair(latestPair, readControl(controlRoot), "auto", runtime);
    }, AUTO_SYNC_STABILITY_MS);

    autoSyncTimers.set(pair.messageId, timer);
  }

  function handleExtensionContextInvalidated(): void {
    if (!runtime.isValid()) {
      return;
    }

    observer?.disconnect();
    observer = null;

    if (scanTimer !== null) {
      window.clearTimeout(scanTimer);
      scanTimer = null;
    }

    autoSyncTimers.forEach((timer) => window.clearTimeout(timer));
    autoSyncTimers.clear();

    document.querySelectorAll<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`).forEach((root) => {
      setControlState(readControl(root), "error", "Extension was reloaded. Refresh this AI chat tab.");
    });
  }
})();
