import type { ChatPairPayload } from "../shared/config";
import { getByteLength } from "./request-size";

const MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES = 340_000;

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

export function normalizeMarkdownBackup(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeMarkdownUrl(value: string): string {
  return value.replace(/\)/g, "%29");
}

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

export function flushMarkdownUnit(units: string[], lines: string[]): void {
  const unit = lines.join("\n").trim();

  if (unit) {
    units.push(unit);
  }
}

export function flushMarkdownChunk(chunks: string[], chunk: string): void {
  const normalized = chunk.trim();

  if (normalized) {
    chunks.push(normalized);
  }
}
