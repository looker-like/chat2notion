export const RICH_TEXT_CHUNK_LIMIT = 2000;
export const MAX_RICH_TEXT_CHUNKS = 90;

export function splitRichText(text: string): string[] {
  const normalized = text.trim();

  if (!normalized) {
    return [""];
  }

  const chunks: string[] = [];
  let index = 0;

  while (index < normalized.length) {
    chunks.push(normalized.slice(index, index + RICH_TEXT_CHUNK_LIMIT));
    index += RICH_TEXT_CHUNK_LIMIT;
  }

  return chunks;
}

export function assertRichTextFitsNotion(value: string, label: string): void {
  const chunks = splitRichText(value);

  if (chunks.length > MAX_RICH_TEXT_CHUNKS) {
    throw new Error(`${label} is too long to sync safely to Notion in V1.`);
  }
}

export function createTitleFromQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 80) || "ChatGPT answer";
}
