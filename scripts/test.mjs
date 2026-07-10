import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const contentSource = readSourceTree("src/content");
const backgroundSource = readSourceTree("src/background");
const manifestSource = read("manifest.config.ts");
const packageJson = JSON.parse(read("package.json"));
const pnpmLock = read("pnpm-lock.yaml");

const expectedPlatforms = [
  { id: "chatgpt", aiName: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"], match: "https://chatgpt.com/*" },
  {
    id: "gemini",
    aiName: "Gemini",
    hosts: ["gemini.google.com", "bard.google.com"],
    match: "https://gemini.google.com/*",
  },
  { id: "deepseek", aiName: "DeepSeek", hosts: ["chat.deepseek.com"], match: "https://chat.deepseek.com/*" },
  { id: "claude", aiName: "Claude", hosts: ["claude.ai"], match: "https://claude.ai/*" },
  { id: "grok", aiName: "Grok", hosts: ["grok.com", "x.com"], match: "https://grok.com/*" },
  {
    id: "perplexity",
    aiName: "Perplexity",
    hosts: ["perplexity.ai", "www.perplexity.ai"],
    match: "https://www.perplexity.ai/*",
  },
  {
    id: "copilot",
    aiName: "Copilot",
    hosts: ["copilot.microsoft.com", "www.bing.com"],
    match: "https://copilot.microsoft.com/*",
  },
  { id: "poe", aiName: "Poe", hosts: ["poe.com", "www.poe.com"], match: "https://poe.com/*" },
  { id: "mistral", aiName: "Mistral", hosts: ["chat.mistral.ai", "mistral.ai"], match: "https://chat.mistral.ai/*" },
  { id: "meta", aiName: "Meta AI", hosts: ["meta.ai", "www.meta.ai"], match: "https://www.meta.ai/*" },
  { id: "doubao", aiName: "Doubao", hosts: ["doubao.com", "www.doubao.com"], match: "https://www.doubao.com/*" },
  {
    id: "kimi",
    aiName: "Kimi",
    hosts: ["kimi.moonshot.cn", "kimi.com", "www.kimi.com"],
    match: "https://kimi.moonshot.cn/*",
  },
  {
    id: "qwen",
    aiName: "Qwen",
    hosts: ["chat.qwen.ai", "qwen.ai", "tongyi.aliyun.com", "qianwen.aliyun.com", "www.qianwen.com"],
    match: "https://chat.qwen.ai/*",
  },
  { id: "yuanbao", aiName: "Yuanbao", hosts: ["yuanbao.tencent.com"], match: "https://yuanbao.tencent.com/*" },
  {
    id: "chatglm",
    aiName: "ChatGLM",
    hosts: ["chatglm.cn", "www.chatglm.cn", "chatglm.com", "chat.z.ai"],
    match: "https://chatglm.cn/*",
  },
  {
    id: "ernie",
    aiName: "ERNIE",
    hosts: ["yiyan.baidu.com", "chat.baidu.com", "wenxin.baidu.com"],
    match: "https://yiyan.baidu.com/*",
  },
  { id: "huggingchat", aiName: "HuggingChat", hosts: ["huggingface.co"], match: "https://huggingface.co/chat/*" },
  { id: "duck", aiName: "Duck.ai", hosts: ["duck.ai", "duckduckgo.com"], match: "https://duck.ai/*" },
  { id: "you", aiName: "You.com", hosts: ["you.com", "www.you.com"], match: "https://you.com/*" },
];

test("package versions stay in sync", () => {
  assert.match(pnpmLock, /^lockfileVersion:\s*'9\.0'/);
  assert.match(pnpmLock, /^\s+\.:/m);
  assert.match(manifestSource, new RegExp(`version:\\s*"${escapeRegExp(packageJson.version)}"`));
});

test("content adapters cover the expected mainstream AI platforms", () => {
  for (const platform of expectedPlatforms) {
    assert.match(
      contentSource,
      new RegExp(`id:\\s*"${escapeRegExp(platform.id)}"`),
      `${platform.id} adapter is missing`,
    );
    assert.match(
      contentSource,
      new RegExp(`aiName:\\s*"${escapeRegExp(platform.aiName)}"`),
      `${platform.aiName} label is missing`,
    );

    for (const host of platform.hosts) {
      assert.match(contentSource, new RegExp(`"${escapeRegExp(host)}"`), `${platform.id} host ${host} is missing`);
    }
  }
});

test("manifest injects content scripts on expected platform hosts", () => {
  for (const platform of expectedPlatforms) {
    assert.match(manifestSource, new RegExp(`"${escapeRegExp(platform.match)}"`), `manifest missing ${platform.match}`);
  }

  assert.match(manifestSource, /"https:\/\/\*\.doubao\.com\/\*"/);
  assert.match(manifestSource, /"https:\/\/api\.notion\.com\/\*"/);
});

test("Doubao adapter recognizes current message data-testid structure", () => {
  assert.match(contentSource, /id:\s*"doubao"/);
  assert.match(contentSource, /"div\[data-testid='receive_message'\]"/);
  assert.match(contentSource, /"div\[data-testid='send_message'\]"/);
  assert.match(contentSource, /"div\[data-testid='message_text_content'\]"/);
  assert.match(contentSource, /function getDoubaoAssistantMessages/);
  assert.match(contentSource, /function findPreviousDoubaoUserMessage/);
  assert.match(contentSource, /closest<HTMLElement>\("\[data-testid='union_message'\]"\)/);
});

test("content controls are found from the insertion host for Doubao-style nested messages", () => {
  assert.match(contentSource, /function findExistingControl\(/);
  assert.match(contentSource, /const insertionTarget = findInsertionTarget\(pair\.assistant\)/);
  assert.match(contentSource, /removeDuplicateControls\(insertionTarget, control\.root\)/);
  assert.match(
    contentSource,
    /findExistingControl\(pair\.assistant, findInsertionTarget\(pair\.assistant\), pair\.messageId\)/,
  );
});

test("content sync payload carries adapter identity and namespaces message IDs", () => {
  assert.match(contentSource, /aiName:\s*pair\.aiName/);
  assert.match(contentSource, /createMessageId\(question\.text,\s*answer\.text,\s*sourceUrl,\s*adapter\.id\)/);
  assert.match(contentSource, /return `\$\{platformId\}-\$\{hashString\(seed\)\}`/);
});

test("multi-platform user-facing copy does not imply ChatGPT-only support", () => {
  assert.doesNotMatch(read("src/popup/popup.html"), /ChatGPT/);
  assert.doesNotMatch(read("src/shared/text.ts"), /ChatGPT answer/);
  assert.doesNotMatch(contentSource, /Refresh this ChatGPT tab/);
  assert.doesNotMatch(contentSource, /ChatGPT conversation/);
});

test("AI platforms keep multi-block reasoning and answer sections separated", () => {
  assert.match(contentSource, /const reasoningBlocks = parts\.slice\(0, -1\)/);
  assert.match(contentSource, /const answerBlock = parts\[parts\.length - 1\]/);
  assert.ok(contentSource.includes("<details><summary><h2>思考内容</h2></summary>"));
  assert.ok(contentSource.includes("<details><summary><h2>正式回答</h2></summary>"));
});

test("Notion AI select options include every adapter label", () => {
  for (const platform of expectedPlatforms) {
    assert.match(
      backgroundSource,
      new RegExp(`name:\\s*"${escapeRegExp(platform.aiName)}"`),
      `AI select missing ${platform.aiName}`,
    );
  }

  assert.match(backgroundSource, /getMissingAiSelectOptions/);
  assert.match(backgroundSource, /createAiSelectPropertySchema/);
  assert.match(backgroundSource, /patchProperties\.AI/);
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readSourceTree(relativePath) {
  return listSourceFiles(path.join(root, relativePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function listSourceFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listSourceFiles(entryPath) : [entryPath];
    })
    .filter((filePath) => filePath.endsWith(".ts"))
    .sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
