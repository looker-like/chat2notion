import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

async function main() {
  await cleanDist();
  await fs.mkdir(distDir, { recursive: true });
  await buildManifest();
  await copyAndTranspile(srcDir, path.join(distDir, "src"));
  await verifyBuildOutput();
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
    version: packageJson.version,
    action: {
      default_title: "Chat2Notion",
    },
    options_page: "src/popup/popup.html",
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

    if (entry.name.endsWith(".html")) {
      await copyHtml(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function copyHtml(sourcePath, targetPath) {
  const source = await fs.readFile(sourcePath, "utf8");
  const rewritten = source.replace(/(<script\b[^>]*\bsrc=["'][^"']+)\.ts(["'][^>]*>)/g, "$1.js$2");
  await fs.copyFile(sourcePath, targetPath);
  await fs.writeFile(targetPath, rewritten);
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

async function verifyBuildOutput() {
  const manifestPath = path.join(distDir, "manifest.json");
  const contentPath = path.join(distDir, "src", "content", "index.js");
  const popupHtmlPath = path.join(distDir, "src", "popup", "popup.html");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const content = await fs.readFile(contentPath, "utf8");
  const popupHtml = await fs.readFile(popupHtmlPath, "utf8");

  if (/^\s*(import|export)\s/m.test(content)) {
    throw new Error("Content script output must not contain top-level import/export.");
  }

  if (popupHtml.includes(".ts")) {
    throw new Error("Popup HTML output must reference compiled .js files, not .ts files.");
  }

  if (manifest.action?.default_popup) {
    await assertDistFileExists(manifest.action.default_popup);
  }

  await assertDistFileExists(manifest.options_page);
  await assertDistFileExists(manifest.background?.service_worker);

  for (const contentScript of manifest.content_scripts ?? []) {
    for (const scriptPath of contentScript.js ?? []) {
      await assertDistFileExists(scriptPath);
    }
  }
}

async function assertDistFileExists(relativePath) {
  if (typeof relativePath !== "string" || !relativePath) {
    throw new Error("Manifest contains an empty referenced file path.");
  }

  await fs.access(path.join(distDir, relativePath));
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
