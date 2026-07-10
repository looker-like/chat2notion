// Shared DOM helpers used by platform-specific Doubao and DeepSeek modules.
// Centralized here to avoid duplication and circular dependencies.

import { CONTROL_ATTRIBUTE } from "../constants";

// Query the DOM with multiple selectors, deduplicating results.
export function querySelectorList(selectors: string[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const nodes: HTMLElement[] = [];

  selectors.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        nodes.push(node);
      }
    });
  });

  return nodes;
}

// Filter out empty, nested, or already-processed message nodes.
export function filterMessageNodes(nodes: HTMLElement[]): HTMLElement[] {
  const candidates = nodes.filter((node) => {
    const text = node.textContent?.trim() ?? "";
    return text && !isInsideChat2NotionControl(node) && !node.closest(`[${CONTROL_ATTRIBUTE}]`);
  });

  return candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)));
}

// Check whether a node is inside an existing Chat2Notion control bar.
export function isInsideChat2NotionControl(node: HTMLElement): boolean {
  return Boolean(node.closest(`[${CONTROL_ATTRIBUTE}]`));
}
