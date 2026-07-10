import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MAX_LINES = 300;
const CODE_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs", ".ts", ".tsx"]);
const CHECK_DIRS = ["src", "scripts"];
const packageManagerCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

checkLineLimits();

for (const scriptName of ["typecheck", "build", "lint"]) {
  runNpmScript(scriptName);
}

function checkLineLimits() {
  const oversizedFiles = listCodeFiles()
    .map((filePath) => ({ filePath, lines: countCodeLines(filePath) }))
    .filter((file) => file.lines > MAX_LINES)
    .sort((left, right) => right.lines - left.lines);

  if (oversizedFiles.length === 0) {
    console.log(`line-limit: all code files are <= ${MAX_LINES} lines`);
    return;
  }

  console.error(`line-limit: found files over ${MAX_LINES} lines`);

  for (const file of oversizedFiles) {
    console.error(`${file.lines.toString().padStart(4)} ${path.relative(process.cwd(), file.filePath)}`);
  }

  process.exit(1);
}

function listCodeFiles() {
  return CHECK_DIRS.flatMap((directory) => walk(path.join(process.cwd(), directory))).filter((filePath) =>
    CODE_EXTENSIONS.has(path.extname(filePath)),
  );
}

function walk(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

// Count lines excluding comment-only lines (// and /* */ style comments).
function countCodeLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (text.length === 0) return 0;

  const lines = text.split(/\r?\n/);
  let codeLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === "") continue;

    // Handle block comment state
    if (inBlockComment) {
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    // Check if line is entirely a comment
    if (trimmed.startsWith("//")) continue;

    // Check for block comment start
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    // Check for inline block comment (entire line is a block comment)
    if (trimmed.startsWith("*") && !trimmed.startsWith("**")) continue;

    // Line contains code
    codeLines++;
  }

  return codeLines;
}

function runNpmScript(scriptName) {
  console.log(`\n> pnpm run ${scriptName}`);

  const result = spawnSync(packageManagerCommand, ["run", scriptName], {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
