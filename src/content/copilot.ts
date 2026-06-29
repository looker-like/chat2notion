/**
 * Helper to query elements deeply through Shadow DOM boundaries
 */
export function queryDeepAll(selector: string, root: Document | Element | ShadowRoot = document): HTMLElement[] {
  let results: HTMLElement[] = [];
  
  if ('querySelectorAll' in root) {
    results.push(...Array.from((root as Element | Document | ShadowRoot).querySelectorAll<HTMLElement>(selector)));
  }

  const elements = 'querySelectorAll' in root 
    ? (root as Element | Document | ShadowRoot).querySelectorAll('*')
    : [];
  
  for (const el of Array.from(elements)) {
    if (el.shadowRoot) {
      results = results.concat(queryDeepAll(selector, el.shadowRoot));
    }
  }

  return results;
}

/**
 * Helper to find closest ancestor across Shadow DOM boundaries
 */
export function closestDeep(element: Element, selector: string): HTMLElement | null {
  let current: Element | null = element;
  while (current) {
    const closest = current.closest(selector);
    if (closest) return closest as HTMLElement;
    
    const rootNode = current.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      current = rootNode.host;
    } else {
      break;
    }
  }
  return null;
}

export function getCopilotAssistantMessages(): HTMLElement[] {
  // We need to return the outer wrapper so the button is appended correctly
  // The outer wrapper has data-testid="ai-message" or data-content="ai-message"
  const botMessages = queryDeepAll("[data-testid='ai-message'], [data-content='ai-message'], cib-message[source='bot']");
  return Array.from(new Set(botMessages)).filter(node => node.textContent?.trim());
}

export function getCopilotUserMessages(): HTMLElement[] {
  const userMessages = queryDeepAll("[data-content='user-message'], [data-testid*='user-message'], cib-message[source='user']");
  return Array.from(new Set(userMessages)).filter(node => node.textContent?.trim());
}

/**
 * Recursively clone a node and its shadow DOM into a regular flat DOM tree.
 */
export function flattenShadowDOM(node: Element): Element {
  const clone = node.cloneNode(false) as Element;
  const root = node.shadowRoot || node;
  
  for (const child of Array.from(root.childNodes)) {
    if (child instanceof Element) {
      clone.appendChild(flattenShadowDOM(child));
    } else {
      clone.appendChild(child.cloneNode(true));
    }
  }
  
  return clone;
}

export function getCopilotMessageClone(message: HTMLElement): HTMLElement {
  // Return a flattened version of the message so that standard DOM APIs
  // (like querySelector, textContent, and Turndown) can read its content.
  return flattenShadowDOM(message) as HTMLElement;
}
