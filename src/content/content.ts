// Content script entry point — runs as an IIFE in the context of AI chat pages.
// Responsibilities:
//   1. Observe the page DOM for new/updated assistant messages.
//   2. Inject Sync / Open in Notion / Auto-save control bars.
//   3. Coordinate with the background worker for sync operations.
//   4. Handle global and per-conversation auto-sync.

import {
  ASSISTANT_PROCESSED_ATTRIBUTE,
  CONFIG_STORAGE_KEY,
  CONVERSATION_AUTO_SYNC_STORAGE_KEY,
  CONTROL_ATTRIBUTE,
  OBSERVER_DEBOUNCE_MS,
} from "./constants";
import type { ChatPair, ControlNodes } from "./types";
import { createConversationKey } from "./messages";
import { buildChatPair, getAssistantMessages } from "./platform";
import { createRuntimeClient } from "./runtime";
import { handleManualSync, initializeSyncedState } from "./sync";
import { createPageDiagnostics, isDiagnosticsRequest } from "./diagnostics";
import {
  createControl,
  ensureStyles,
  readControl,
  setControlState,
  syncOpenButton,
  openNotionPage,
} from "./controls";
import { findExistingControl, findInsertionTarget, removeDuplicateControls } from "./dom-helpers";
import { AutoSyncManager } from "./auto-sync";

(() => {
  // --- State ---
  let autoSyncEnabled = false;
  let conversationKey = createConversationKey();
  let scanTimer: number | null = null;
  let observer: MutationObserver | null = null;
  const autoSyncTimers = new Map<string, number>();
  const runtime = createRuntimeClient(handleExtensionContextInvalidated);
  const autoSyncManager = createAutoSyncManager();

  void initialize();

  function createAutoSyncManager(): AutoSyncManager {
    return new AutoSyncManager({
      conversationKey,
      runtime,
      autoSyncTimers,
      scheduleScan,
      syncAllButtons: syncAllConversationAutoButtons,
    });
  }

  void initialize();

  // --- Initialization ---
  async function initialize(): Promise<void> {
    ensureStyles();
    await refreshConfig();
    await refreshConversationAutoSync();
    scanPage();
    observeChat();

    // Re-scan when the user changes config or conversation auto-sync from the popup.
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

    // Handle diagnostic requests from the popup "Check" button.
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isDiagnosticsRequest(message)) {
        return false;
      }

      scanPage();
      sendResponse({ ok: true, diagnostics: createPageDiagnostics() });
      return false;
    });

    // Re-scan on SPA navigation (popstate) and as a safety net every second.
    window.addEventListener("popstate", () => {
      void handleLocationChanged();
    });

    window.setInterval(() => {
      if (conversationKey !== createConversationKey()) {
        void handleLocationChanged();
      }
    }, 1000);
  }

  // --- Config refresh ---

  async function refreshConfig(): Promise<void> {
    const response = await runtime.sendMessage({ type: "chat2notion:getConfig" });

    if (response.ok && "config" in response) {
      autoSyncEnabled = response.config.autoSyncEnabled;
    }
  }

  async function refreshConversationAutoSync(): Promise<void> {
    const key = createConversationKey();
    conversationKey = key;
    autoSyncManager.setConversationKey(key);
  }

  // --- Navigation handling ---

  async function handleLocationChanged(): Promise<void> {
    const key = createConversationKey();
    conversationKey = key;
    autoSyncManager.setConversationKey(key);
    scheduleScan(100);
  }

  // --- DOM observation ---

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

  // --- Page scanning ---

  function scanPage(): void {
    getAssistantMessages().forEach((assistant) => {
      const pair = buildChatPair(assistant);

      if (!pair) {
        return;
      }

      ensureControl(pair);

      if (autoSyncEnabled || autoSyncManager.isEnabled) {
        autoSyncManager.schedule(pair);
      }
    });
  }

  // --- Control injection ---

  function ensureControl(pair: ChatPair): void {
    pair.assistant.setAttribute(ASSISTANT_PROCESSED_ATTRIBUTE, "true");

    const insertionTarget = findInsertionTarget(pair.assistant);
    const existing = findExistingControl(pair.assistant, insertionTarget, pair.messageId);
    const control = existing
      ? (readControl(existing) as ControlNodes)
      : createControl(pair);

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
      void autoSyncManager.toggle(latestPair, control);
    };
    autoSyncManager.syncButton(control);
    syncOpenButton(control);

    void initializeSyncedState(pair.messageId, control, runtime);
  }

  // --- Conversation auto-sync ---

  function syncAllConversationAutoButtons(): void {
    document.querySelectorAll<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`).forEach((root) => {
      autoSyncManager.syncButton(readControl(root));
    });
  }

  // --- Extension reload handling ---

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
