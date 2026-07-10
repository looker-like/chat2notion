// Copilot adapter: matches Microsoft Copilot/Bing with ac-container and ai-message-body selectors.
// Supports Shadow DOM traversal for nested Copilot components.
import { PlatformAdapter } from "./types";

export const copilotAdapter: PlatformAdapter = {
        id: "copilot",
        aiName: "Copilot",
        hosts: ["copilot.microsoft.com", "www.bing.com", "edgeservices.bing.com", "sydney.bing.com"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-testid*='assistant']",
          "[data-content='ai-message']",
          ".assistant-message",
          ".ac-container",
          "[class*='assistant']",
          "[class*='bot']",
        ],
        userSelectors: [
          "[data-message-author-role='user']",
          "[data-testid*='user']",
          "[data-content='user-message']",
          ".user-message",
          "[class*='user']",
        ],
        contentSelectors: ["[data-testid='ai-message-body']", ".markdown", "[class*='markdown']", ".ac-textBlock", "[class*='message']", "[class*='content']"],
        assistantArticlePattern: /assistant|copilot|bing|answer|response/i,
        userArticlePattern: /user|you|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
