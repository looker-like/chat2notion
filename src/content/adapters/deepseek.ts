import { PlatformAdapter } from "./types";

export const deepseekAdapter: PlatformAdapter = {
        id: "deepseek",
        aiName: "DeepSeek",
        hosts: ["chat.deepseek.com"],
        assistantSelectors: [
          ".ds-virtual-list-visible-items > ._4f9bf79",
          "._4f9bf79",
          "._43c05b5",
          "[data-message-author-role='assistant']",
          "[data-role='assistant']",
          "[data-testid*='assistant']",
          ".assistant-message",
          ".ai-message",
          ".ds-markdown",
          "[class*='assistant']",
        ],
        userSelectors: [
          ".ds-virtual-list-visible-items > ._9663006",
          "._9663006",
          "[data-message-author-role='user']",
          "[data-role='user']",
          "[data-testid*='user']",
          ".user-message",
          "[class*='user']",
        ],
        contentSelectors: [".ds-markdown", ".markdown", "[class*='markdown']", "[class*='content']"],
        assistantArticlePattern: /assistant|deepseek|answer|response/i,
        userArticlePattern: /user|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
