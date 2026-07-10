// Meta AI adapter: matches Meta.ai's chat interface.
import { PlatformAdapter } from "./types";

export const metaAdapter: PlatformAdapter = {
        id: "meta",
        aiName: "Meta AI",
        hosts: ["meta.ai", "www.meta.ai"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-testid*='assistant']",
          ".assistant-message",
          ".ai-message",
          "[class*='assistant']",
        ],
        userSelectors: ["[data-message-author-role='user']", "[data-testid*='user']", ".user-message", "[class*='user']"],
        contentSelectors: [".markdown", "[class*='markdown']", "[class*='message']", "[class*='content']"],
        assistantArticlePattern: /assistant|meta|answer|response/i,
        userArticlePattern: /user|you|question|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
