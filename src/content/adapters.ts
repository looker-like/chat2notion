import { PlatformAdapter } from "./adapters/types";
import { chatgptAdapter } from "./adapters/chatgpt";
import { geminiAdapter } from "./adapters/gemini";
import { deepseekAdapter } from "./adapters/deepseek";
import { claudeAdapter } from "./adapters/claude";
import { grokAdapter } from "./adapters/grok";
import { perplexityAdapter } from "./adapters/perplexity";
import { copilotAdapter } from "./adapters/copilot";
import { poeAdapter } from "./adapters/poe";
import { mistralAdapter } from "./adapters/mistral";
import { metaAdapter } from "./adapters/meta";
import { doubaoAdapter } from "./adapters/doubao";
import { kimiAdapter } from "./adapters/kimi";
import { qwenAdapter } from "./adapters/qwen";
import { yuanbaoAdapter } from "./adapters/yuanbao";
import { chatglmAdapter } from "./adapters/chatglm";
import { ernieAdapter } from "./adapters/ernie";
import { huggingchatAdapter } from "./adapters/huggingchat";
import { duckAdapter } from "./adapters/duck";
import { youAdapter } from "./adapters/you";

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  chatgptAdapter,
  geminiAdapter,
  deepseekAdapter,
  claudeAdapter,
  grokAdapter,
  perplexityAdapter,
  copilotAdapter,
  poeAdapter,
  mistralAdapter,
  metaAdapter,
  doubaoAdapter,
  kimiAdapter,
  qwenAdapter,
  yuanbaoAdapter,
  chatglmAdapter,
  ernieAdapter,
  huggingchatAdapter,
  duckAdapter,
  youAdapter
];
export const FALLBACK_ADAPTER: PlatformAdapter = {
  id: "generic",
  aiName: "AI",
  hosts: [],
  assistantSelectors: [
    "[data-message-author-role='assistant']",
    "[data-role='assistant']",
    "[data-testid*='assistant']",
    ".assistant-message",
    ".ai-message",
    "[class*='assistant']",
  ],
  userSelectors: [
    "[data-message-author-role='user']",
    "[data-role='user']",
    "[data-testid*='user']",
    ".user-message",
    "[class*='user']",
  ],
  contentSelectors: [".markdown", "[class*='markdown']", "[class*='message']", "[class*='content']"],
  assistantArticlePattern: /assistant|answer|response/i,
  userArticlePattern: /user|question|prompt/i,
  streamingSelectors: ['[aria-label*="Stop"]', '[aria-label*="停止"]', '[data-testid*="stop"]', "[class*='stop']"],
};
