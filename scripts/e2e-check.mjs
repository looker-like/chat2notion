import { chromium } from "playwright";

const PLATFORMS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Copilot", url: "https://copilot.microsoft.com/" }
];

(async () => {
  console.log("正在通过 CDP 连接到正在运行的浏览器 (http://localhost:9222)...");
  let browser;
  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
    console.log("✅ 成功连接到浏览器！");
  } catch (err) {
    console.error("❌ 无法连接到浏览器！");
    console.error("请确保你使用 --remote-debugging-port=9222 参数启动了 Edge Beta。");
    console.error("错误详情:", err.message);
    process.exit(1);
  }

  const defaultContext = browser.contexts()[0];
  if (!defaultContext) {
    console.error("❌ 找不到默认的浏览器上下文！");
    process.exit(1);
  }

  console.log("-----------------------------------------");
  console.log("🚀 开始自动巡检 AI 平台注入状态...");
  
  const page = await defaultContext.newPage();

  for (const platform of PLATFORMS) {
    console.log(`\n🔍 正在检查: ${platform.name} (${platform.url})`);
    try {
      await page.goto(platform.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      
      // 等待控制按钮出现（最大等待 10 秒）
      // 注意：某些平台必须要发送一条消息后才会出现按钮。这里只是简单的基础检查。
      try {
        await page.waitForSelector("[data-chat2notion-control]", { timeout: 10000 });
        console.log(`✅ ${platform.name}: 成功找到 Chat2Notion 同步按钮！`);
      } catch (e) {
        console.error(`❌ ${platform.name}: 未找到同步按钮 (可能是 DOM 更新，或者当前页面没有聊天记录)`);
      }
    } catch (err) {
      console.error(`⚠️ 访问 ${platform.name} 失败: ${err.message}`);
    }
  }

  console.log("\n-----------------------------------------");
  console.log("🏁 巡检完成！正在关闭测试标签页...");
  await page.close();
  await browser.close();
})();
