// Yuanbao adapter: matches Tencent Yuanbao chat interface.
import { PlatformAdapter } from "./types";

export const yuanbaoAdapter: PlatformAdapter = {
        id: "yuanbao",
        aiName: "Yuanbao",
        hosts: ["yuanbao.tencent.com"],
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
        assistantArticlePattern: /assistant|yuanbao|answer|response|元宝|回答/i,
        userArticlePattern: /user|question|prompt|用户|提问/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[aria-label*="停止"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
