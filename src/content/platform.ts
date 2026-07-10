// Platform adapter selection, DOM querying, and chat-pair building.
// This module is the bridge between the raw AI chat DOM and the sync system.
// It selects the correct adapter for the current host, finds assistant/user
// messages, and pairs each assistant message with its preceding user message.
// Platform-specific DOM helpers are delegated to submodules.

import { PLATFORM_ADAPTERS, FALLBACK_ADAPTER } from "./adapters";
import type { PlatformAdapter } from "./adapters/types";
import { createMessageId, extractMessageContent } from "./messages";
import type { ChatPair } from "./types";
import { getDeepSeekAssistantRows, findPreviousDeepSeekUserMessage } from "./platform/deepseek";
import { getDoubaoAssistantMessages, getDoubaoUserMessages, findPreviousDoubaoUserMessage } from "./platform/doubao";
import { querySelectorList, filterMessageNodes, isInsideChat2NotionControl } from "./platform/common";

// Find all assistant message nodes on the current page using the active adapter.
// DeepSeek and Doubao have special handling for their virtualized/custom DOM structures.
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

// Find all user message nodes on the current page.
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

// Select the platform adapter matching the current page hostname.
export function getCurrentAdapter(): PlatformAdapter {
  const host = location.hostname.toLowerCase();
  return (
    PLATFORM_ADAPTERS.find((adapter) =>
      adapter.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)),
    ) ?? FALLBACK_ADAPTER
  );
}

// Build a ChatPair from an assistant message node by pairing it with the preceding user message.
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

// Find the user message that precedes the given assistant message in DOM order.
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

// Check whether an assistant element is still receiving streaming content.
export function isAnswerStillStreaming(assistant: HTMLElement): boolean {
  const selectors = getCurrentAdapter().streamingSelectors;
  return selectors.some((selector) => Boolean(assistant.querySelector(selector)));
}
