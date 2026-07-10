// Inject and manage the Sync / Open in Notion / Auto-save control bar
// for each detected AI assistant message.

import {
  AUTO_ICON,
  CONTROL_ATTRIBUTE,
  CONTROL_CLASS,
  OPEN_ICON,
  SYNC_ICON,
  SYNCED_ICON,
} from "./constants";
import type { ChatPair, ControlNodes } from "./types";

// Create a new control bar DOM structure for an assistant message.
export function createControl(pair: ChatPair): ControlNodes {
  const root = document.createElement("div");
  root.className = CONTROL_CLASS;
  root.setAttribute(CONTROL_ATTRIBUTE, "true");
  root.dataset.messageId = pair.messageId;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.role = "sync";
  button.title = "Sync to Notion";
  button.innerHTML = SYNC_ICON;

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.dataset.role = "notion-open";
  openButton.title = "Open in Notion";
  openButton.innerHTML = OPEN_ICON;
  openButton.hidden = true;

  const autoButton = document.createElement("button");
  autoButton.type = "button";
  autoButton.dataset.role = "conversation-auto-sync";
  autoButton.title = "Auto-save chat";
  autoButton.innerHTML = AUTO_ICON;

  const status = document.createElement("span");
  status.textContent = "";

  root.append(button, openButton, autoButton, status);
  return { root, button, openButton, autoButton, status };
}

// Read existing control nodes from a control bar root element.
// If any expected child is missing, creates a replacement element.
export function readControl(root: HTMLDivElement): ControlNodes {
  const button =
    root.querySelector<HTMLButtonElement>("button[data-role='sync']") ??
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((node) => {
      const role = node.dataset.role;
      return role !== "conversation-auto-sync" && role !== "notion-open";
    }) ??
    document.createElement("button");
  const openButton =
    root.querySelector<HTMLButtonElement>("button[data-role='notion-open']") ?? document.createElement("button");
  const autoButton =
    root.querySelector<HTMLButtonElement>("button[data-role='conversation-auto-sync']") ??
    document.createElement("button");
  const status = root.querySelector<HTMLSpanElement>("span") ?? document.createElement("span");

  if (!button.parentElement) {
    button.type = "button";
    root.append(button);
  }

  button.dataset.role = "sync";
  if (!button.innerHTML) {
    button.innerHTML = SYNC_ICON;
  }

  if (!openButton.parentElement) {
    openButton.type = "button";
    openButton.dataset.role = "notion-open";
    openButton.innerHTML = OPEN_ICON;
    openButton.title = "Open in Notion";
    openButton.hidden = true;
    root.append(openButton);
  }

  if (!autoButton.parentElement) {
    autoButton.type = "button";
    autoButton.dataset.role = "conversation-auto-sync";
    autoButton.innerHTML = AUTO_ICON;
    root.append(autoButton);
  }

  if (!status.parentElement) {
    root.append(status);
  }

  return { root, button, openButton, autoButton, status };
}

// Update the control bar's visual state (idle, pending, synced, error).
export function setControlState(
  control: ControlNodes,
  state: "idle" | "pending" | "synced" | "error",
  message: string,
): void {
  control.root.dataset.state = state;
  control.status.textContent = message;
  control.button.disabled = state === "pending";
  if (state === "pending") {
    control.button.classList.add("c2n-pending");
    control.button.innerHTML = SYNC_ICON;
    control.button.title = "Syncing...";
  } else if (state === "synced") {
    control.button.classList.remove("c2n-pending");
    control.button.innerHTML = SYNCED_ICON;
    control.button.title = "Synced. Click to resync and overwrite the existing Notion page.";
  } else {
    control.button.classList.remove("c2n-pending");
    control.button.innerHTML = SYNC_ICON;
    control.button.title = "Sync to Notion";
  }
  control.autoButton.disabled = state === "pending";
  syncOpenButton(control);
}

// Update only the status text on the control bar.
export function setControlStatus(control: ControlNodes, message: string): void {
  control.status.textContent = message;
}

// Store the Notion page ID on the control bar and update the Open button visibility.
export function setNotionPageId(control: ControlNodes, notionPageId: string): void {
  if (notionPageId) {
    control.root.dataset.notionPageId = notionPageId;
  } else {
    delete control.root.dataset.notionPageId;
  }

  syncOpenButton(control);
}

// Show/hide and enable/disable the Open in Notion button based on state.
export function syncOpenButton(control: ControlNodes): void {
  const notionPageId = control.root.dataset.notionPageId ?? "";
  const hasPage = Boolean(notionPageId);
  control.openButton.hidden = !hasPage;
  control.openButton.disabled = !hasPage || control.root.dataset.state === "pending";
  control.openButton.title = hasPage ? "Open the synced Notion page in a new tab." : "";
}

// Open the synced Notion page in a new browser tab.
export function openNotionPage(control: ControlNodes): void {
  const notionPageId = control.root.dataset.notionPageId ?? "";

  if (!notionPageId) {
    setControlStatus(control, "No Notion page link is available yet.");
    return;
  }

  window.open(createNotionPageUrl(notionPageId), "_blank", "noopener,noreferrer");
}

// Build the public Notion page URL from a page ID.
export function createNotionPageUrl(notionPageId: string): string {
  return `https://www.notion.so/${notionPageId.replace(/-/g, "")}`;
}

// Inject or update the control bar stylesheet.
// Always updates the content so extension reloads pick up CSS changes
// even when the page itself is not refreshed.
export function ensureStyles(): void {
  const existing = document.getElementById("chat2notion-style");
  const style = existing ?? document.createElement("style");
  style.id = "chat2notion-style";
  style.textContent = `
.${CONTROL_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 2px;
  font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.${CONTROL_CLASS} button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #c8d1e1;
  border-radius: 50%;
  padding: 0;
  color: #18314f;
  background: #f8fbff;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}
.${CONTROL_CLASS} button:hover:not(:disabled) {
  border-color: #5179bd;
  background: #eef5ff;
  color: #1a56db;
}
.${CONTROL_CLASS} button[data-role="conversation-auto-sync"] {
  border-color: #d7b56d;
  color: #5a3d08;
  background: #fff8e8;
}
.${CONTROL_CLASS} button[data-role="conversation-auto-sync"][data-enabled="true"] {
  border-color: #2f7a4c;
  color: #155a32;
  background: #eaf8ef;
}
.${CONTROL_CLASS} button[data-role="conversation-auto-sync"]:hover:not(:disabled) {
  border-color: #c2953a;
  background: #fff2d1;
}
.${CONTROL_CLASS} button[data-role="conversation-auto-sync"][data-enabled="true"]:hover:not(:disabled) {
  border-color: #235e38;
  background: #d5f2df;
}
.${CONTROL_CLASS} button[hidden] {
  display: none !important;
}
.${CONTROL_CLASS} button:disabled {
  cursor: default;
  opacity: 0.5;
}
@keyframes c2n-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.${CONTROL_CLASS} button.c2n-pending svg {
  animation: c2n-spin 1.2s linear infinite;
}
.${CONTROL_CLASS} span {
  color: #617089;
}
.${CONTROL_CLASS}[data-state="synced"] span {
  color: #1f7a45;
}
.${CONTROL_CLASS}[data-state="error"] span {
  color: #b3261e;
}
`;
  document.documentElement.append(style);
}
