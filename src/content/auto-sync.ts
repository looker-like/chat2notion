// Conversation auto-sync management.
// Encapsulates the per-conversation auto-sync toggle, state persistence,
// button synchronization, and debounced auto-sync scheduling.

import { CONVERSATION_AUTO_SYNC_STORAGE_KEY, AUTO_SYNCED_ATTRIBUTE, AUTO_ICON, MIN_AUTO_SYNC_ANSWER_LENGTH, AUTO_SYNC_STABILITY_MS } from "./constants";
import { readConversationAutoSyncState } from "./messages";
import { buildChatPair, isAnswerStillStreaming } from "./platform";
import type { RuntimeClient } from "./runtime";
import { syncPair } from "./sync";
import { findExistingControl, findInsertionTarget } from "./dom-helpers";
import { readControl, setControlState, setControlStatus } from "./controls";
import type { ChatPair, ControlNodes } from "./types";

// Dependencies required by the auto-sync manager.
// Passing these in keeps the module testable and avoids IIFE closure coupling.
export interface AutoSyncDeps {
  conversationKey: string;
  runtime: RuntimeClient;
  autoSyncTimers: Map<string, number>;
  scheduleScan: (delay: number) => void;
  syncAllButtons: () => void;
}

// Manager for per-conversation auto-sync state and behavior.
export class AutoSyncManager {
  private enabled = false;
  private conversationKey = "";

  constructor(private deps: AutoSyncDeps) {
    this.conversationKey = deps.conversationKey;
  }

  // Current auto-sync state for the active conversation.
  get isEnabled(): boolean {
    return this.enabled;
  }

  // Update the conversation key (e.g., after navigation) and refresh state.
  setConversationKey(key: string): void {
    this.conversationKey = key;
    this.refresh();
  }

  // Refresh the auto-sync state from storage for the current conversation.
  refresh(): void {
    this.enabled = false;
  }

  // Toggle auto-sync for the current conversation.
  async toggle(pair: ChatPair, control: ControlNodes): Promise<void> {
    const nextEnabled = !this.enabled;
    const saved = await this.setEnabled(nextEnabled);

    if (!saved) {
      setControlState(control, "error", "Extension was reloaded. Refresh this AI chat tab.");
      return;
    }

    this.enabled = nextEnabled;
    this.deps.syncAllButtons();

    if (!nextEnabled) {
      setControlStatus(control, "Conversation auto-save off.");
      return;
    }

    setControlStatus(control, "Conversation auto-save on. Future answers will sync.");

    if (control.root.dataset.state !== "synced") {
      await syncPair(pair, control, "auto", this.deps.runtime);
    }

    this.deps.scheduleScan(100);
  }

  // Schedule auto-sync for a chat pair after the answer stabilizes.
  schedule(pair: ChatPair): void {
    if (pair.assistant.getAttribute(AUTO_SYNCED_ATTRIBUTE) === pair.messageId) {
      return;
    }

    if (pair.answer.length < MIN_AUTO_SYNC_ANSWER_LENGTH || isAnswerStillStreaming(pair.assistant)) {
      this.deps.scheduleScan(AUTO_SYNC_STABILITY_MS);
      return;
    }

    const previousTimer = this.deps.autoSyncTimers.get(pair.messageId);

    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }

    const timer = window.setTimeout(() => {
      this.deps.autoSyncTimers.delete(pair.messageId);
      const latestPair = buildChatPair(pair.assistant);

      if (!latestPair || latestPair.messageId !== pair.messageId || isAnswerStillStreaming(pair.assistant)) {
        this.deps.scheduleScan(AUTO_SYNC_STABILITY_MS);
        return;
      }

      const controlRoot = findExistingControl(pair.assistant, findInsertionTarget(pair.assistant), pair.messageId);

      if (!controlRoot) {
        return;
      }

      void syncPair(latestPair, readControl(controlRoot), "auto", this.deps.runtime);
    }, AUTO_SYNC_STABILITY_MS);

    this.deps.autoSyncTimers.set(pair.messageId, timer);
  }

  // Update the UI of all auto-sync buttons to reflect the current state.
  syncButton(control: ControlNodes): void {
    control.autoButton.innerHTML = AUTO_ICON;
    control.autoButton.dataset.enabled = this.enabled ? "true" : "false";
    control.autoButton.title = this.enabled
      ? "Disable automatic Notion sync for this AI conversation."
      : "Enable automatic Notion sync for this AI conversation.";
  }

  // Persist the auto-sync state to chrome.storage.local.
  private async setEnabled(enabled: boolean): Promise<boolean> {
    const stored = await this.deps.runtime.safeStorageGet(CONVERSATION_AUTO_SYNC_STORAGE_KEY);

    if (!this.deps.runtime.isValid()) {
      return false;
    }

    const state = readConversationAutoSyncState(stored[CONVERSATION_AUTO_SYNC_STORAGE_KEY]);

    if (enabled) {
      state[this.conversationKey] = {
        enabled: true,
        sourceUrl: location.href,
        updatedAt: new Date().toISOString(),
      };
    } else {
      delete state[this.deps.conversationKey];
    }

    return this.deps.runtime.safeStorageSet({ [CONVERSATION_AUTO_SYNC_STORAGE_KEY]: state });
  }
}
