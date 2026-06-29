import { PlatformAdapter } from "./types";

export const grokAdapter: PlatformAdapter = {
        id: "grok",
        aiName: "Grok",
        hosts: ["grok.com", "x.com"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-role='assistant']",
          "[data-testid*='assistant']",
          ".assistant-message",
          ".ai-message",
          "[class*='assistant']",
        ],
        userSelectors: [
          "[data-message-author-role='user']",
          "[data-role='user']",
          "[data-testid*='user']",
          ".user-message",
          "[class*='user']",
        ],
        contentSelectors: [".markdown", "[class*='markdown']", "[class*='message']", "[class*='content']"],
        assistantArticlePattern: /assistant|grok|answer|response/i,
        userArticlePattern: /user|you|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
