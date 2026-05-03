import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

async function main() {
  await cleanDist();
  await fs.mkdir(distDir, { recursive: true });
  await buildManifest();
  await copyAndTranspile(srcDir, path.join(distDir, "src"));
  console.log("Built extension to dist");
}

async function cleanDist() {
  const resolved = path.resolve(distDir);
  const expectedRoot = `${path.resolve(root)}${path.sep}`;

  if (!resolved.startsWith(expectedRoot) || path.basename(resolved) !== "dist") {
    throw new Error(`Refusing to clean unexpected dist path: ${resolved}`);
  }

  await fs.rm(resolved, { recursive: true, force: true });
}

async function buildManifest() {
  const manifest = {
    manifest_version: 3,
    name: "Chat2Notion",
    description: "Sync ChatGPT questions and answers to a Notion database.",
    version: "0.1.0",
    action: {
      default_title: "Chat2Notion",
      default_popup: "src/popup/popup.html",
    },
    background: {
      service_worker: "src/background/index.js",
      type: "module",
    },
    permissions: ["storage", "activeTab"],
    host_permissions: ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://api.notion.com/*"],
    content_scripts: [
      {
        matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
        js: ["src/content/index.js"],
        run_at: "document_idle",
      },
    ],
  };

  await fs.writeFile(path.join(distDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function copyAndTranspile(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyAndTranspile(sourcePath, targetPath);
      continue;
    }

    if (entry.name.endsWith(".ts")) {
      const jsPath = targetPath.replace(/\.ts$/, ".js");
      await transpileTs(sourcePath, jsPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function transpileTs(sourcePath, targetPath) {
  const source = await fs.readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: sourcePath,
  });

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, rewriteRelativeImports(output.outputText));
}

function rewriteRelativeImports(code) {
  return code
    .replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
      return `${prefix}${withJsExtension(specifier)}${suffix}`;
    })
    .replace(/(import\s*["'])(\.\.?\/[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
      return `${prefix}${withJsExtension(specifier)}${suffix}`;
    });
}

function withJsExtension(specifier) {
  return path.extname(specifier) ? specifier : `${specifier}.js`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
