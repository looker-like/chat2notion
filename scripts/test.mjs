import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const contentSource = read("src/content/index.ts");
const backgroundSource = read("src/background/index.ts");
const manifestSource = read("manifest.config.ts");
const buildSource = read("scripts/build.mjs");
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));

const expectedPlatforms = [
  { id: "chatgpt", aiName: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"], match: "https://chatgpt.com/*" },
  { id: "gemini", aiName: "Gemini", hosts: ["gemini.google.com", "bard.google.com"], match: "https://gemini.google.com/*" },
  { id: "deepseek", aiName: "DeepSeek", hosts: ["chat.deepseek.com"], match: "https://chat.deepseek.com/*" },
  { id: "claude", aiName: "Claude", hosts: ["claude.ai"], match: "https://claude.ai/*" },
  { id: "grok", aiName: "Grok", hosts: ["grok.com", "x.com"], match: "https://grok.com/*" },
  { id: "perplexity", aiName: "Perplexity", hosts: ["perplexity.ai", "www.perplexity.ai"], match: "https://www.perplexity.ai/*" },
  { id: "copilot", aiName: "Copilot", hosts: ["copilot.microsoft.com", "www.bing.com"], match: "https://copilot.microsoft.com/*" },
  { id: "poe", aiName: "Poe", hosts: ["poe.com", "www.poe.com"], match: "https://poe.com/*" },
  { id: "mistral", aiName: "Mistral", hosts: ["chat.mistral.ai", "mistral.ai"], match: "https://chat.mistral.ai/*" },
  { id: "meta", aiName: "Meta AI", hosts: ["meta.ai", "www.meta.ai"], match: "https://www.meta.ai/*" },
  { id: "doubao", aiName: "Doubao", hosts: ["doubao.com", "www.doubao.com"], match: "https://www.doubao.com/*" },
  { id: "kimi", aiName: "Kimi", hosts: ["kimi.moonshot.cn", "kimi.com", "www.kimi.com"], match: "https://kimi.moonshot.cn/*" },
  { id: "qwen", aiName: "Qwen", hosts: ["chat.qwen.ai", "qwen.ai", "tongyi.aliyun.com", "qianwen.aliyun.com"], match: "https://chat.qwen.ai/*" },
  { id: "yuanbao", aiName: "Yuanbao", hosts: ["yuanbao.tencent.com"], match: "https://yuanbao.tencent.com/*" },
  { id: "chatglm", aiName: "ChatGLM", hosts: ["chatglm.cn", "www.chatglm.cn", "chatglm.com", "chat.z.ai"], match: "https://chatglm.cn/*" },
  { id: "ernie", aiName: "ERNIE", hosts: ["yiyan.baidu.com", "chat.baidu.com", "wenxin.baidu.com"], match: "https://yiyan.baidu.com/*" },
  { id: "huggingchat", aiName: "HuggingChat", hosts: ["huggingface.co"], match: "https://huggingface.co/chat/*" },
  { id: "duck", aiName: "Duck.ai", hosts: ["duck.ai", "duckduckgo.com"], match: "https://duck.ai/*" },
  { id: "you", aiName: "You.com", hosts: ["you.com", "www.you.com"], match: "https://you.com/*" },
];

test("package versions stay in sync", () => {
  assert.equal(packageJson.version, packageLock.version);
  assert.equal(packageJson.version, packageLock.packages[""].version);
  assert.match(manifestSource, new RegExp(`version:\\s*"${escapeRegExp(packageJson.version)}"`));
});

test("content adapters cover the expected mainstream AI platforms", () => {
  for (const platform of expectedPlatforms) {
    assert.match(contentSource, new RegExp(`id:\\s*"${escapeRegExp(platform.id)}"`), `${platform.id} adapter is missing`);
    assert.match(contentSource, new RegExp(`aiName:\\s*"${escapeRegExp(platform.aiName)}"`), `${platform.aiName} label is missing`);

    for (const host of platform.hosts) {
      assert.match(contentSource, new RegExp(`"${escapeRegExp(host)}"`), `${platform.id} host ${host} is missing`);
    }
  }
});

test("manifest and custom build script inject content scripts on expected platform hosts", () => {
  for (const platform of expectedPlatforms) {
    assert.match(manifestSource, new RegExp(`"${escapeRegExp(platform.match)}"`), `manifest missing ${platform.match}`);
    assert.match(buildSource, new RegExp(`"${escapeRegExp(platform.match)}"`), `build script missing ${platform.match}`);
  }

  assert.match(manifestSource, /"https:\/\/api\.notion\.com\/\*"/);
  assert.match(buildSource, /"https:\/\/api\.notion\.com\/\*"/);
});

test("content sync payload carries adapter identity and namespaces message IDs", () => {
  assert.match(contentSource, /aiName:\s*pair\.aiName/);
  assert.match(contentSource, /createMessageId\(question\.text,\s*answer\.text,\s*sourceUrl,\s*adapter\.id\)/);
  assert.match(contentSource, /return `\$\{platformId\}-\$\{hashString\(seed\)\}`/);
});

test("DeepSeek keeps multi-block reasoning and answer sections separated", () => {
  assert.match(contentSource, /function extractDeepSeekMessageContent/);
  assert.match(contentSource, /querySelectorAll<HTMLElement>\("div\.ds-markdown, \.ds-markdown"\)/);
  assert.match(contentSource, /"## 思考内容"/);
  assert.match(contentSource, /"## 正式回答"/);
});

test("Notion AI select options include every adapter label", () => {
  for (const platform of expectedPlatforms) {
    assert.match(backgroundSource, new RegExp(`name:\\s*"${escapeRegExp(platform.aiName)}"`), `AI select missing ${platform.aiName}`);
  }

  assert.match(backgroundSource, /getMissingAiSelectOptions/);
  assert.match(backgroundSource, /createAiSelectPropertySchema/);
  assert.match(backgroundSource, /patchProperties\.AI/);
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
