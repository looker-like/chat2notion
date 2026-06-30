import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const packageManagerCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const fixtures = [
  platformFixture("ChatGPT", "chatgpt", "https://chatgpt.com/c/local-fixture"),
  {
    ...platformFixture("Gemini", "gemini", "https://gemini.google.com/app/local-fixture"),
    html: geminiHtml("What is Chat2Notion?", "It syncs Gemini answers to Notion."),
  },
  platformFixture("DeepSeek", "deepseek", "https://chat.deepseek.com/a/chat/s/local-fixture"),
  platformFixture("Claude", "claude", "https://claude.ai/chat/local-fixture"),
  platformFixture("Grok", "grok", "https://grok.com/chat/local-fixture"),
  platformFixture("Perplexity", "perplexity", "https://www.perplexity.ai/search/local-fixture"),
  platformFixture("Copilot", "copilot", "https://copilot.microsoft.com/chats/local-fixture"),
  platformFixture("Poe", "poe", "https://poe.com/chat/local-fixture"),
  platformFixture("Mistral", "mistral", "https://chat.mistral.ai/chat/local-fixture"),
  platformFixture("Meta AI", "meta", "https://www.meta.ai/c/local-fixture"),
  platformFixture("Doubao", "doubao", "https://www.doubao.com/chat/local-fixture"),
  platformFixture("Kimi", "kimi", "https://kimi.moonshot.cn/chat/local-fixture"),
  platformFixture("Qwen", "qwen", "https://chat.qwen.ai/c/local-fixture"),
  platformFixture("Yuanbao", "yuanbao", "https://yuanbao.tencent.com/chat/local-fixture"),
  platformFixture("ChatGLM", "chatglm", "https://chatglm.cn/main/detail/local-fixture"),
  platformFixture("ERNIE", "ernie", "https://yiyan.baidu.com/chat/local-fixture"),
  platformFixture("HuggingChat", "huggingchat", "https://huggingface.co/chat/local-fixture"),
  platformFixture("Duck.ai", "duck", "https://duck.ai/chat/local-fixture"),
  platformFixture("You.com", "you", "https://you.com/search?q=local-fixture"),
];

runBuild();

const browser = await chromium.launch();

try {
  for (const fixture of fixtures) {
    await checkFixture(browser, fixture);
  }

  console.log("local fixture e2e: all platform injection checks passed");
} finally {
  await browser.close();
}

function runBuild() {
  const result = spawnSync(packageManagerCommand, ["run", "build"], {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function platformFixture(name, expectedPlatformId, url) {
  return {
    name,
    url,
    expectedPlatformId,
    html: commonHtml(`Question for ${name}`, `Answer from ${name} for Chat2Notion.`),
  };
}

function commonHtml(question, answer) {
  return `<!doctype html>
    <html><body>
      <main>
        <article data-message-author-role="user"><div class="markdown">${escapeHtml(question)}</div></article>
        <article data-message-author-role="assistant"><div class="markdown">${escapeHtml(answer)}</div></article>
      </main>
    </body></html>`;
}

function geminiHtml(question, answer) {
  return `<!doctype html>
    <html><body>
      <main>
        <user-query><div class="query-text">${escapeHtml(question)}</div></user-query>
        <model-response><message-content>${escapeHtml(answer)}</message-content></model-response>
      </main>
    </body></html>`;
}

async function checkFixture(browser, fixture) {
  const page = await browser.newPage();
  await page.addInitScript(mockChromeApis);
  await page.route(fixture.url, (route) => {
    route.fulfill({ status: 200, contentType: "text/html", body: fixture.html });
  });

  try {
    await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: findContentBundle() });
    await page.waitForSelector("[data-chat2notion-control]", { timeout: 5000 });

    const diagnostics = await page.evaluate(() => {
      return window.__chat2notionDispatchMessage({ type: "chat2notion:diagnosePage" });
    });

    assert.equal(diagnostics.ok, true, `${fixture.name} diagnostics should succeed`);
    assert.equal(diagnostics.diagnostics.platformId, fixture.expectedPlatformId);
    assert.equal(diagnostics.diagnostics.ready, true, `${fixture.name} should be ready`);
    assert.equal(diagnostics.diagnostics.controlCount, 1, `${fixture.name} should have one sync control`);
    console.log(`local fixture e2e: ${fixture.name} passed`);
  } finally {
    await page.close();
  }
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findContentBundle() {
  const assetsDirectory = path.join(process.cwd(), "dist", "assets");
  const fileName = fs.readdirSync(assetsDirectory).find((name) => /^content\.ts-.*\.js$/.test(name));

  if (!fileName) {
    throw new Error("Could not find built content script bundle.");
  }

  return path.join(assetsDirectory, fileName);
}

function mockChromeApis() {
  const listeners = [];
  const storage = {};

  window.__chat2notionDispatchMessage = async (message) => {
    for (const listener of listeners) {
      let response;
      const result = listener(message, {}, (value) => {
        response = value;
      });

      if (response !== undefined || result === false) {
        return response;
      }
    }

    return undefined;
  };

  window.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
      async sendMessage(message) {
        if (message.type === "chat2notion:getConfig") {
          return { ok: true, config: { autoSyncEnabled: false } };
        }

        if (message.type === "chat2notion:isSynced") {
          return { ok: true, synced: false };
        }

        return { ok: true };
      },
    },
    storage: {
      local: {
        async get(key) {
          return typeof key === "string" ? { [key]: storage[key] } : {};
        },
        async set(value) {
          Object.assign(storage, value);
        },
      },
      onChanged: {
        addListener() {},
      },
    },
  };
}
