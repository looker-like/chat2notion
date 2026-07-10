// Rendering functions for the extension popup.
// Each function updates a specific region of the popup UI based on config state.

import type { Chat2NotionConfig } from "./popup-types";

// Populate the config form inputs and refresh derived UI regions.
export function renderConfig(
  config: Chat2NotionConfig,
  apiKeyInput: HTMLInputElement,
  databaseIdInput: HTMLInputElement,
  autoSyncInput: HTMLInputElement,
  lastSyncNode: HTMLParagraphElement,
  connectionBadge: HTMLSpanElement,
): void {
  apiKeyInput.value = config.apiKey;
  databaseIdInput.value = config.databaseId;
  autoSyncInput.checked = config.autoSyncEnabled;
  renderLastSync(config, lastSyncNode);
  renderBadge(config, connectionBadge);
}

// Update the "last sync" paragraph with the latest sync status and timestamp.
export function renderLastSync(config: Chat2NotionConfig, lastSyncNode: HTMLParagraphElement): void {
  if (!config.lastSyncStatus) {
    lastSyncNode.textContent = "No sync recorded yet.";
    delete lastSyncNode.dataset.tone;
    return;
  }

  lastSyncNode.textContent = `${config.lastSyncStatus.message} (${formatDate(config.lastSyncStatus.at)})`;
  lastSyncNode.dataset.tone = config.lastSyncStatus.tone;
}

// Update the connection status badge based on whether the extension is fully configured.
export function renderBadge(config: Chat2NotionConfig, connectionBadge: HTMLSpanElement): void {
  const configured = Boolean(config.apiKey && config.databaseId && config.dataSourceId);
  connectionBadge.textContent = configured ? "Ready" : "Not configured";
  connectionBadge.dataset.tone = configured ? "success" : "idle";
}

// Format an ISO timestamp for display in Chinese locale (24-hour format).
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
