// Claude adapter: matches Claude.ai's message structure with font-claude-message classes.
import { PlatformAdapter } from "./types";

export const claudeAdapter: PlatformAdapter = {
        id: "claude",
        aiName: "Claude",
        hosts: ["claude.ai"],
        assistantSelectors: [
          "[data-message-author-role='assistant']",
          "[data-testid*='assistant']",
          "[data-testid*='message']",
          ".assistant-message",
          "[class*='assistant']",
          "[class*='font-claude-message']",
        ],
        userSelectors: [
          "[data-message-author-role='user']",
          "[data-testid*='user']",
          "[data-testid*='message']",
          ".user-message",
          "[class*='user']",
        ],
        contentSelectors: [
          ".markdown",
          "[class*='markdown']",
          "[class*='font-claude-message']",
          "[class*='message']",
          "[class*='content']",
        ],
        assistantArticlePattern: /assistant|claude|response/i,
        userArticlePattern: /user|you|human|prompt/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
