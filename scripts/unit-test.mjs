// Transpile and run markdown unit tests.
// Uses TypeScript transpileModule so tests can be written in TS without a separate build step.

import { fileURLToPath, pathToFileURL } from "node:url";
import { transpileModule, ModuleKind, ModuleResolutionKind, ScriptTarget, JsxEmit } from "typescript";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Setup jsdom globals ---

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.location = dom.window.location;

// --- Transpile helpers ---

const transpileCache = new Map();

function transpileToTemp(tsPath) {
  const cached = transpileCache.get(tsPath);
  if (cached && fs.existsSync(cached)) return cached;

  const source = fs.readFileSync(tsPath, "utf8");
  const result = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ES2022,
      moduleResolution: ModuleResolutionKind.Bundler,
      target: ScriptTarget.ES2022,
      jsx: JsxEmit.None,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      sourceMap: false,
    },
    fileName: tsPath,
  });

  // For source files (not test files), output as .js so imports resolve naturally.
  const isSourceFile = !tsPath.endsWith(".test.ts");
  const jsName = isSourceFile ? tsPath.replace(/\.ts$/, ".js") : tsPath.replace(/\.ts$/, ".test-run.js");
  fs.writeFileSync(jsName, result.outputText);
  transpileCache.set(tsPath, jsName);
  return jsName;
}

// --- Pre-transpile the source module so the test can import it ---

const contentDir = path.join(__dirname, "..", "src", "content");
transpileToTemp(path.join(contentDir, "markdown.ts"));

// --- Transpile and run the test file ---

const testFile = path.join(contentDir, "markdown.test.ts");
const testJs = transpileToTemp(testFile);

// Import the transpiled test — node:test registers tests as a side effect.
await import(pathToFileURL(testJs).href);
