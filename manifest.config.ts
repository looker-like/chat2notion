import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Chat2Notion",
  description: "Sync AI questions and answers to a Notion database.",
  version: "0.2.3",
  action: {
    default_title: "Chat2Notion",
    default_popup: "src/popup/popup.html",
  },
  options_page: "src/popup/popup.html",
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["storage", "activeTab"],
  host_permissions: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://gemini.google.com/*",
    "https://bard.google.com/*",
    "https://chat.deepseek.com/*",
    "https://doubao.com/*",
    "https://www.doubao.com/*",
    "https://grok.com/*",
    "https://*.grok.com/*",
    "https://x.com/i/grok*",
    "https://api.notion.com/*",
  ],
  content_scripts: [
    {
      matches: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://gemini.google.com/*",
        "https://bard.google.com/*",
        "https://chat.deepseek.com/*",
        "https://doubao.com/*",
        "https://www.doubao.com/*",
        "https://grok.com/*",
        "https://*.grok.com/*",
        "https://x.com/i/grok*",
      ],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});
