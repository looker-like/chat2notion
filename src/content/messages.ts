import { normalizeMarkdown, elementToMarkdown } from "./markdown";
import type { PlatformAdapter } from "./adapters/types";
import { CONTROL_ATTRIBUTE } from "./constants";
import type { MessageContent } from "./types";

export function extractMessageContent(message: HTMLElement, adapter: PlatformAdapter): MessageContent {
    const clone = message.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`[${CONTROL_ATTRIBUTE}], script, style, button, svg`).forEach((node) => node.remove());

    let elements: HTMLElement[] = [];

    // Find all independent content blocks matching the first successful selector
    for (const selector of adapter.contentSelectors) {
      if (clone.matches(selector)) {
        elements = [clone];
        break;
      }

      const children = Array.from(clone.querySelectorAll<HTMLElement>(selector)).filter(
        (node) => !isInsideChat2NotionControl(node),
      );

      if (children.length > 0) {
        // Filter out nested matches
        elements = children.filter((child) => !children.some((other) => other !== child && other.contains(child)));
        break;
      }
    }

    if (elements.length === 0) {
      elements = [clone];
    }

    const parts = elements
      .map((block) => ({
        text: normalizeText(block.innerText || block.textContent || ""),
        markdown: normalizeMarkdown(elementToMarkdown(block)),
      }))
      .filter((block) => block.text || block.markdown);

    if (parts.length === 0) {
      const text = normalizeText(clone.innerText || clone.textContent || "");
      const markdown = normalizeMarkdown(elementToMarkdown(clone)) || text;
      return { text, markdown };
    }

    if (parts.length === 1) {
      return {
        text: normalizeText(parts[0].text || parts[0].markdown),
        markdown: normalizeMarkdown(parts[0].markdown || parts[0].text),
      };
    }

    // For multiple blocks (e.g. ChatGLM, DeepSeek, Doubao, Kimi), treat all but the last as Reasoning / Search Process
    const reasoningBlocks = parts.slice(0, -1);
    const answerBlock = parts[parts.length - 1];

    const reasoningText = normalizeText(reasoningBlocks.map((block) => block.text || block.markdown).join("\n\n"));
    const answerText = normalizeText(answerBlock.text || answerBlock.markdown);
    const reasoningMarkdown = normalizeMarkdown(
      reasoningBlocks.map((block) => block.markdown || block.text).join("\n\n"),
    );
    const answerMarkdown = normalizeMarkdown(answerBlock.markdown || answerBlock.text);

    const text = normalizeText(["思考内容", reasoningText, "正式回答", answerText].join("\n\n"));
    const markdown = normalizeMarkdown(
      [
        "<details><summary><h2>思考内容</h2></summary>",
        reasoningMarkdown,
        "</details>",
        "<details><summary><h2>正式回答</h2></summary>",
        answerMarkdown,
        "</details>",
      ].join("\n\n"),
    );

    return { text, markdown };
  }

export function createMessageId(question: string, answer: string, sourceUrl: string, platformId: string): string {
    const url = new URL(sourceUrl);
    const platformSeed = platformId === "chatgpt" ? "" : `${platformId}|`;
    const seed = `${platformSeed}${url.origin}${url.pathname}|${normalizeText(question)}|${normalizeText(answer).slice(0, 600)}|${answer.length}`;
    return `${platformId}-${hashString(seed)}`;
  }

export function hashString(value: string): string {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

export function normalizeText(value: string): string {
    return value
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

export function createConversationKey(): string {
    const url = new URL(location.href);
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/new-chat"}`;
  }

export function readConversationAutoSyncState(
    value: unknown,
  ): Record<string, { enabled: true; sourceUrl: string; updatedAt: string }> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, { enabled: true; sourceUrl: string; updatedAt: string }] => {
          const item = entry[1];
          return (
            typeof item === "object" &&
            item !== null &&
            !Array.isArray(item) &&
            (item as { enabled?: unknown }).enabled === true &&
            typeof (item as { sourceUrl?: unknown }).sourceUrl === "string" &&
            typeof (item as { updatedAt?: unknown }).updatedAt === "string"
          );
        },
      ),
    );
  }

function isInsideChat2NotionControl(node: HTMLElement): boolean {
  return Boolean(node.closest(`[${CONTROL_ATTRIBUTE}]`));
}
