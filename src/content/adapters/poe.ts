import { PlatformAdapter } from "./types";

export const poeAdapter: PlatformAdapter = {
        id: "poe",
        aiName: "Poe",
        hosts: ["poe.com", "www.poe.com"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-testid*='bot']",
          "[data-testid*='assistant']",
          "[class*='Message_bot']",
          "[class*='botMessage']",
          "[class*='assistant']",
        ],
        userSelectors: [
          "[data-message-author-role='user']",
          "[data-testid*='user']",
          "[class*='Message_human']",
          "[class*='humanMessage']",
          "[class*='user']",
        ],
        contentSelectors: [
          ".markdown",
          "[class*='markdown']",
          "[class*='Message']",
          "[class*='message']",
          "[class*='content']",
        ],
        assistantArticlePattern: /assistant|bot|poe|answer|response/i,
        userArticlePattern: /user|human|you|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
