import { PlatformAdapter } from "./types";

export const chatgptAdapter: PlatformAdapter = {
        id: "chatgpt",
        aiName: "ChatGPT",
        hosts: ["chatgpt.com", "chat.openai.com"],
        assistantSelectors: ['[data-message-author-role="assistant"]'],
        userSelectors: ['[data-message-author-role="user"]'],
        contentSelectors: [".markdown", "[data-message-content]", "[data-testid='conversation-turn-message']"],
        assistantArticlePattern: /assistant|chatgpt/i,
        userArticlePattern: /user|you/i,
        streamingSelectors: [
          '[data-testid="stop-button"]',
          '[aria-label*="Stop"]',
          '[aria-label*="停止"]',
          ".result-streaming",
        ],
      };
