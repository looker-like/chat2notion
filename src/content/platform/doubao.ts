// Doubao-specific DOM helpers.
// Doubao uses data-testid='union_message' rows with nested
// receive_message/send_message structure for message detection.

import { querySelectorList, filterMessageNodes } from "./common";

// Find all Doubao assistant message containers.
export function getDoubaoAssistantMessages(): HTMLElement[] {
  const explicitMessages = querySelectorList([
    "div[data-testid='receive_message']",
    "[data-testid='receive_message']",
  ]);

  if (explicitMessages.length > 0) {
    return filterMessageNodes(explicitMessages);
  }

  return filterMessageNodes(getDoubaoMessageRows().filter(isDoubaoAssistantRow));
}

// Find all Doubao user message containers.
export function getDoubaoUserMessages(): HTMLElement[] {
  const explicitMessages = querySelectorList(["div[data-testid='send_message']", "[data-testid='send_message']"]);

  if (explicitMessages.length > 0) {
    return filterMessageNodes(explicitMessages);
  }

  return filterMessageNodes(getDoubaoMessageRows().filter(isDoubaoUserRow));
}

// Find the user message preceding the given assistant message in Doubao's row structure.
export function findPreviousDoubaoUserMessage(assistant: HTMLElement): HTMLElement | null {
  const row = getDoubaoMessageRow(assistant);
  let previous = row?.previousElementSibling ?? null;

  while (previous) {
    if (previous instanceof HTMLElement && isDoubaoUserRow(previous)) {
      return previous.querySelector<HTMLElement>("[data-testid='send_message']") ?? previous;
    }

    previous = previous.previousElementSibling;
  }

  return null;
}

// Get all union_message row elements.
export function getDoubaoMessageRows(): HTMLElement[] {
  return querySelectorList(["div[data-testid='union_message']", "[data-testid='union_message']"]);
}

// Find the union_message or receive_message row containing a node.
export function getDoubaoMessageRow(node: HTMLElement): HTMLElement | null {
  return (
    node.closest<HTMLElement>("[data-testid='union_message']") ??
    node.closest<HTMLElement>("[data-testid='receive_message']")
  );
}

// Determine if a row is an assistant message row.
export function isDoubaoAssistantRow(row: HTMLElement): boolean {
  return Boolean(
    row.matches("[data-testid='receive_message']") ||
    row.querySelector("[data-testid='receive_message']") ||
    (row.querySelector("[data-testid='message_text_content']") &&
      !isDoubaoUserRow(row) &&
      (row.querySelector("[data-testid='message_action_copy']") ||
        row.querySelector("[data-testid='message_action_dislike']"))),
  );
}

// Determine if a row is a user message row.
export function isDoubaoUserRow(row: HTMLElement): boolean {
  return Boolean(row.matches("[data-testid='send_message']") || row.querySelector("[data-testid='send_message']"));
}
