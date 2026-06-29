import { PlatformAdapter } from "./types";

export const mistralAdapter: PlatformAdapter = {
        id: "mistral",
        aiName: "Mistral",
        hosts: ["chat.mistral.ai", "mistral.ai"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-testid*='assistant']",
          ".assistant-message",
          ".ai-message",
          "[class*='assistant']",
        ],
        userSelectors: ["[data-message-author-role='user']", "[data-testid*='user']", ".user-message", "[class*='user']"],
        contentSelectors: [".markdown", "[class*='markdown']", "[class*='message']", "[class*='content']"],
        assistantArticlePattern: /assistant|mistral|answer|response/i,
        userArticlePattern: /user|you|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
