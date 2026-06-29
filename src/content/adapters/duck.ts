import { PlatformAdapter } from "./types";

export const duckAdapter: PlatformAdapter = {
        id: "duck",
        aiName: "Duck.ai",
        hosts: ["duck.ai", "duckduckgo.com"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-role='assistant']",
          "[data-testid*='assistant']",
          ".assistant-message",
          ".ai-message",
          "[class*='assistant']",
          "[class*='answer']",
        ],
        userSelectors: [
          "[data-message-author-role='user']",
          "[data-role='user']",
          "[data-testid*='user']",
          ".user-message",
          "[class*='user']",
          "[class*='question']",
        ],
        contentSelectors: [
          ".markdown",
          "[class*='markdown']",
          "[class*='message']",
          "[class*='content']",
          "[class*='answer']",
        ],
        assistantArticlePattern: /assistant|duck|answer|response/i,
        userArticlePattern: /user|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
