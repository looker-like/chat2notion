// DOM helpers for control bar insertion and deduplication.
// These functions determine where to inject control bars and clean up duplicates.

import { CONTROL_ATTRIBUTE } from "./constants";
import { getCurrentAdapter } from "./platform";

// Determine where to insert the control bar for a given assistant message.
// Doubao requires insertion at the union_message wrapper level, not inside the message itself.
export function findInsertionTarget(assistant: HTMLElement): HTMLElement {
  if (getCurrentAdapter().id === "doubao") {
    return (
      assistant.closest<HTMLElement>("[data-testid='union_message']") ??
      assistant.closest<HTMLElement>("[data-testid='receive_message']") ??
      assistant
    );
  }

  const article = assistant.closest<HTMLElement>("article");
  return article ?? assistant;
}

// Find an existing control bar for a message, deduplicating by messageId.
export function findExistingControl(
  assistant: HTMLElement,
  insertionTarget: HTMLElement,
  messageId: string,
): HTMLDivElement | null {
  const assistantControl = assistant.querySelector<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`);

  if (assistantControl) {
    return assistantControl;
  }

  const directControls = Array.from(insertionTarget.children).filter((node): node is HTMLDivElement => {
    return node instanceof HTMLDivElement && node.hasAttribute(CONTROL_ATTRIBUTE);
  });

  return directControls.find((node) => node.dataset.messageId === messageId) ?? directControls[0] ?? null;
}

// Remove duplicate control bars from the insertion target, keeping only the specified one.
export function removeDuplicateControls(insertionTarget: HTMLElement, keep: HTMLDivElement): void {
  Array.from(insertionTarget.children).forEach((node) => {
    if (node instanceof HTMLDivElement && node !== keep && node.hasAttribute(CONTROL_ATTRIBUTE)) {
      node.remove();
    }
  });
}
