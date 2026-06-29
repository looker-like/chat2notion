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
    .map((filePath) => ({ filePath, lines: countLines(filePath) }))
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

function countLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
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
