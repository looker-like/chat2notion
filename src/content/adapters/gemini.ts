// Gemini adapter: matches Google Gemini/Bard using model-response and user-query custom elements.
import { PlatformAdapter } from "./types";

export const geminiAdapter: PlatformAdapter = {
        id: "gemini",
        aiName: "Gemini",
        hosts: ["gemini.google.com", "bard.google.com"],
        assistantSelectors: [
          "model-response",
          "[data-testid='model-response']",
          "[data-test-id='model-response']",
          ".model-response",
        ],
        userSelectors: ["user-query", "[data-testid='user-query']", "[data-test-id='user-query']", ".user-query"],
        contentSelectors: [".markdown", "message-content", ".message-content", ".response-content", ".query-text"],
        assistantArticlePattern: /assistant|gemini|model|response/i,
        userArticlePattern: /user|you|query|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', ".stop-button"],
      };
