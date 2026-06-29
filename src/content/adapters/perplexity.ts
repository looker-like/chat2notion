import { PlatformAdapter } from "./types";

export const perplexityAdapter: PlatformAdapter = {
        id: "perplexity",
        aiName: "Perplexity",
        hosts: ["perplexity.ai", "www.perplexity.ai"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-testid*='answer']",
          "[data-testid*='assistant']",
          "[class*='answer']",
          "[class*='prose']",
        ],
        userSelectors: [
          "[data-message-author-role='user']",
          "[data-testid*='query']",
          "[data-testid*='question']",
          "[class*='query']",
          "[class*='question']",
        ],
        contentSelectors: [
          ".prose",
          ".markdown",
          "[class*='prose']",
          "[class*='markdown']",
          "[class*='answer']",
          "[class*='content']",
        ],
        assistantArticlePattern: /assistant|answer|response|perplexity/i,
        userArticlePattern: /user|query|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
