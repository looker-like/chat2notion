import { spawn } from "node:child_process";
import path from "node:path";

const viteCommand = process.platform === "win32" ? "vite.cmd" : "vite";
const extensionDirectory = path.join(process.cwd(), "dist");

console.log("Chat2Notion extension dev mode");
console.log(`Load unpacked extension from: ${extensionDirectory}`);
console.log("Keep this process running while editing.");
console.log("Reload the extension and refresh AI chat tabs after manifest/background/content-script changes.\n");

const vite = spawn(viteCommand, ["--host", "127.0.0.1", "--mode", "development"], {
  cwd: process.cwd(),
  shell: process.platform === "win32",
  stdio: "inherit",
});

let exiting = false;

function exitDev(code) {
  if (exiting) {
    return;
  }

  exiting = true;

  if (!vite.killed) {
    vite.kill();
  }

  process.exit(code);
}

vite.on("error", (error) => {
  console.error(error.message);
  exitDev(1);
});

vite.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  exitDev(code ?? 0);
});

process.on("SIGINT", () => exitDev(130));
process.on("SIGTERM", () => exitDev(143));
