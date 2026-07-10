// Markdown backup generation and chunking for Notion page bodies.
// The Markdown backup preserves full formatting (links, headings, lists,
// code blocks, tables) that cannot be represented in database properties.

import type { ChatPairPayload } from "../shared/config";
import { getByteLength } from "./request-size";

const MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES = 340_000;

// Build a complete Markdown backup document for a synced chat pair.
export function createPageMarkdownBackup(payload: ChatPairPayload): string {
  const question = normalizeMarkdownBackup(payload.questionMarkdown || payload.question);
  const answer = normalizeMarkdownBackup(payload.answerMarkdown || payload.answer);
  const sourceUrl = escapeMarkdownUrl(payload.sourceUrl);

  return [
    "# AI Sync Backup",
    `AI: ${payload.aiName || "ChatGPT"}`,
    `Source: [${sourceUrl}](${sourceUrl})`,
    `Synced At: ${new Date().toISOString()}`,
    `Sync Mode: ${payload.syncMode}`,
    `Message ID: ${payload.messageId}`,
    "---",
    "## Question",
    question,
    "---",
    "## Answer",
    answer,
  ].join("\n\n");
}

// Normalize whitespace in Markdown content before storing it.
export function normalizeMarkdownBackup(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Escape closing parentheses in URLs so Markdown link syntax isn't broken.
export function escapeMarkdownUrl(value: string): string {
  return value.replace(/\)/g, "%29");
}

// Split a Markdown document into chunks suitable for Notion's insert_content API.
// Tries to break at paragraph boundaries; code blocks are kept intact.
export function splitMarkdownForNotion(markdown: string): string[] {
  const units = splitMarkdownUnits(markdown);
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (getByteLength(unit) > MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES) {
      flushMarkdownChunk(chunks, current);
      current = "";
      chunks.push(...splitTextByByteLimit(unit, MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES));
      continue;
    }

    const candidate = current ? `${current}\n\n${unit}` : unit;

    if (getByteLength(candidate) > MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES) {
      flushMarkdownChunk(chunks, current);
      current = unit;
    } else {
      current = candidate;
    }
  }

  flushMarkdownChunk(chunks, current);
  return chunks.length > 0 ? chunks : ["No content captured."];
}

// Split Markdown into semantic units: each unit is a contiguous block of
// non-empty lines, with fenced code blocks treated as a single unit.
export function splitMarkdownUnits(markdown: string): string[] {
  const units: string[] = [];
  const lines = normalizeMarkdownBackup(markdown).split("\n");
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
    }

    if (!inFence && !line.trim()) {
      flushMarkdownUnit(units, current);
      current = [];
      continue;
    }

    current.push(line);
  }

  flushMarkdownUnit(units, current);
  return units;
}

// Split a single oversized text unit into byte-limited chunks.
export function splitTextByByteLimit(value: string, byteLimit: number): string[] {
  const chunks: string[] = [];
  const encoder = new TextEncoder();
  let current = "";
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).length;

    if (current && currentBytes + characterBytes > byteLimit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }

    current += character;
    currentBytes += characterBytes;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

// Append a non-empty unit to the units array.
export function flushMarkdownUnit(units: string[], lines: string[]): void {
  const unit = lines.join("\n").trim();

  if (unit) {
    units.push(unit);
  }
}

// Append a non-empty chunk to the chunks array.
export function flushMarkdownChunk(chunks: string[], chunk: string): void {
  const normalized = chunk.trim();

  if (normalized) {
    chunks.push(normalized);
  }
}
