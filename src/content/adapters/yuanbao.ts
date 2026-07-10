// Yuanbao adapter: matches Tencent Yuanbao chat interface.
// DOM structure uses .agent-chat__list__item--ai / --human for role discrimination.
import { PlatformAdapter } from "./types";

export const yuanbaoAdapter: PlatformAdapter = {
        id: "yuanbao",
        aiName: "Yuanbao",
        hosts: ["yuanbao.tencent.com"],
        assistantSelectors: [
          ".agent-chat__list__item--ai",
          "[class*='agent-chat__list__item--ai']",
          ".agent-chat__bubble--ai",
          "[class*='hyc-content-md']",
        ],
        userSelectors: [
          ".agent-chat__list__item--human",
          "[class*='agent-chat__list__item--human']",
        ],
        contentSelectors: [
          ".hyc-content-md",
          ".hyc-common-markdown",
          ".agent-chat__bubble__content",
          "[class*='hyc-content-md']",
          "[class*='hyc-common-markdown']",
        ],
        assistantArticlePattern: /assistant|yuanbao|answer|response|元宝|回答/i,
        userArticlePattern: /user|question|prompt|用户|提问/i,
        streamingSelectors: ['[aria-label*="Stop"]', '[aria-label*="停止"]', '[data-testid*="stop"]', "[class*='stop']"],
      };
