// DeepSeek-specific DOM helpers.
// DeepSeek uses a virtualized visible list (`.ds-virtual-list-visible-items`)
// so only currently mounted answers are scanned.

import { isInsideChat2NotionControl } from "./common";

// Find all visible DeepSeek assistant rows in the virtualized list.
export function getDeepSeekAssistantRows(): HTMLElement[] {
  const container = getDeepSeekMessageContainer();

  if (!container) {
    return [];
  }

  return Array.from(container.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement && isDeepSeekAssistantRow(node),
  );
}

// Find the user message preceding the given assistant message in DeepSeek's row structure.
export function findPreviousDeepSeekUserMessage(assistant: HTMLElement): HTMLElement | null {
  const row = getDeepSeekMessageRow(assistant);
  let previous = row?.previousElementSibling ?? null;

  while (previous) {
    if (previous instanceof HTMLElement && isDeepSeekUserRow(previous)) {
      return previous;
    }

    previous = previous.previousElementSibling;
  }

  return null;
}

// Get the DeepSeek virtualized visible list container.
export function getDeepSeekMessageContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".ds-virtual-list-visible-items");
}

// Find the DeepSeek message row containing a node.
export function getDeepSeekMessageRow(node: HTMLElement): HTMLElement | null {
  const container = getDeepSeekMessageContainer();

  if (!container) {
    return null;
  }

  return (
    Array.from(container.children).find(
      (child): child is HTMLElement => child instanceof HTMLElement && (child === node || child.contains(node)),
    ) ?? null
  );
}

// Determine if a row is an assistant message row (contains ds-markdown).
export function isDeepSeekAssistantRow(row: HTMLElement): boolean {
  return Boolean(row.querySelector("div.ds-markdown")) && !isInsideChat2NotionControl(row);
}

// Determine if a row is a user message row.
export function isDeepSeekUserRow(row: HTMLElement): boolean {
  if (row.matches("._9663006") || row.querySelector("._9663006")) {
    return true;
  }

  const text = row.textContent?.trim() ?? "";
  return Boolean(text) && !row.querySelector("div.ds-markdown") && !isInsideChat2NotionControl(row);
}
