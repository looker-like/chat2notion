import { PLATFORM_ADAPTERS, FALLBACK_ADAPTER } from "./adapters";
import type { PlatformAdapter } from "./adapters/types";
import { CONTROL_ATTRIBUTE } from "./constants";
import { createMessageId, extractMessageContent } from "./messages";
import type { ChatPair } from "./types";

export function getAssistantMessages(): HTMLElement[] {
    const adapter = getCurrentAdapter();

    if (adapter.id === "deepseek") {
      const deepSeekRows = getDeepSeekAssistantRows();

      if (deepSeekRows.length > 0) {
        return deepSeekRows;
      }
    }

    if (adapter.id === "doubao") {
      const doubaoMessages = getDoubaoAssistantMessages();

      if (doubaoMessages.length > 0) {
        return doubaoMessages;
      }
    }

    const bySelector = querySelectorList(adapter.assistantSelectors);

    if (bySelector.length > 0) {
      return filterMessageNodes(bySelector);
    }

    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));
    return articles.filter((article) => {
      const text = article.textContent?.trim() ?? "";
      const ariaLabel = article.getAttribute("aria-label") ?? "";
      return text && adapter.assistantArticlePattern.test(ariaLabel) && !isInsideChat2NotionControl(article);
    });
  }

export function getUserMessages(): HTMLElement[] {
    const adapter = getCurrentAdapter();

    if (adapter.id === "doubao") {
      const doubaoMessages = getDoubaoUserMessages();

      if (doubaoMessages.length > 0) {
        return doubaoMessages;
      }
    }

    const bySelector = querySelectorList(adapter.userSelectors);

    if (bySelector.length > 0) {
      return filterMessageNodes(bySelector);
    }

    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));
    return articles.filter((article) => adapter.userArticlePattern.test(article.getAttribute("aria-label") ?? ""));
  }

export function getCurrentAdapter(): PlatformAdapter {
    const host = location.hostname.toLowerCase();
    return (
      PLATFORM_ADAPTERS.find((adapter) =>
        adapter.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)),
      ) ?? FALLBACK_ADAPTER
    );
  }

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

export function filterMessageNodes(nodes: HTMLElement[]): HTMLElement[] {
    const candidates = nodes.filter((node) => {
      const text = node.textContent?.trim() ?? "";
      return text && !isInsideChat2NotionControl(node) && !node.closest(`[${CONTROL_ATTRIBUTE}]`);
    });

    return candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)));
  }

export function buildChatPair(assistant: HTMLElement): ChatPair | null {
    const adapter = getCurrentAdapter();
    const answer = extractMessageContent(assistant, adapter);

    if (!answer.text) {
      return null;
    }

    const user = findPreviousUserMessage(assistant);
    const question = user ? extractMessageContent(user, adapter) : { text: "", markdown: "" };

    if (!question.text) {
      return null;
    }

    const sourceUrl = location.href;
    const messageId = createMessageId(question.text, answer.text, sourceUrl, adapter.id);

    return {
      assistant,
      aiName: adapter.aiName,
      platformId: adapter.id,
      question: question.text,
      questionMarkdown: question.markdown,
      answer: answer.text,
      answerMarkdown: answer.markdown,
      messageId,
      sourceUrl,
    };
  }

export function findPreviousUserMessage(assistant: HTMLElement): HTMLElement | null {
    const adapter = getCurrentAdapter();

    if (adapter.id === "deepseek") {
      const deepSeekUser = findPreviousDeepSeekUserMessage(assistant);

      if (deepSeekUser) {
        return deepSeekUser;
      }
    }

    if (adapter.id === "doubao") {
      const doubaoUser = findPreviousDoubaoUserMessage(assistant);

      if (doubaoUser) {
        return doubaoUser;
      }
    }

    const users = getUserMessages();
    let previous: HTMLElement | null = null;

    for (const user of users) {
      const position = user.compareDocumentPosition(assistant);

      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        previous = user;
        continue;
      }
    }

    return previous;
  }

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

export function getDoubaoUserMessages(): HTMLElement[] {
    const explicitMessages = querySelectorList(["div[data-testid='send_message']", "[data-testid='send_message']"]);

    if (explicitMessages.length > 0) {
      return filterMessageNodes(explicitMessages);
    }

    return filterMessageNodes(getDoubaoMessageRows().filter(isDoubaoUserRow));
  }

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

export function getDoubaoMessageRows(): HTMLElement[] {
    return querySelectorList(["div[data-testid='union_message']", "[data-testid='union_message']"]);
  }

export function getDoubaoMessageRow(node: HTMLElement): HTMLElement | null {
    return (
      node.closest<HTMLElement>("[data-testid='union_message']") ??
      node.closest<HTMLElement>("[data-testid='receive_message']")
    );
  }

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

export function isDoubaoUserRow(row: HTMLElement): boolean {
    return Boolean(row.matches("[data-testid='send_message']") || row.querySelector("[data-testid='send_message']"));
  }

export function getDeepSeekAssistantRows(): HTMLElement[] {
    const container = getDeepSeekMessageContainer();

    if (!container) {
      return [];
    }

    return Array.from(container.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && isDeepSeekAssistantRow(node),
    );
  }

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

export function getDeepSeekMessageContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".ds-virtual-list-visible-items");
  }

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

export function isDeepSeekAssistantRow(row: HTMLElement): boolean {
    return Boolean(row.querySelector("div.ds-markdown")) && !isInsideChat2NotionControl(row);
  }

export function isDeepSeekUserRow(row: HTMLElement): boolean {
    if (row.matches("._9663006") || row.querySelector("._9663006")) {
      return true;
    }

    const text = row.textContent?.trim() ?? "";
    return Boolean(text) && !row.querySelector("div.ds-markdown") && !isInsideChat2NotionControl(row);
  }

export function isAnswerStillStreaming(assistant: HTMLElement): boolean {
    const selectors = getCurrentAdapter().streamingSelectors;
    return selectors.some((selector) => Boolean(assistant.querySelector(selector)));
  }

export function isInsideChat2NotionControl(node: HTMLElement): boolean {
    return Boolean(node.closest(`[${CONTROL_ATTRIBUTE}]`));
  }
