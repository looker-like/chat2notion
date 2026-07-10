// Helpers for splitting long text into Notion-compatible chunks.
// Notion rich_text objects have a 2000-character limit per chunk and a max of 90 chunks.

export const RICH_TEXT_CHUNK_LIMIT = 2000;
export const MAX_RICH_TEXT_CHUNKS = 90;

// Split text into chunks of at most RICH_TEXT_CHUNK_LIMIT characters.
// Returns a non-empty array; empty input yields [""].
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

// Throw if a value would exceed Notion's safe rich_text chunk limit.
export function assertRichTextFitsNotion(value: string, label: string): void {
  const chunks = splitRichText(value);

  if (chunks.length > MAX_RICH_TEXT_CHUNKS) {
    throw new Error(`${label} is too long to sync safely to Notion in V1.`);
  }
}

// Build a short Notion page title from the user's question.
// Truncated to 80 characters; falls back to "AI answer" for empty input.
export function createTitleFromQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 80) || "AI answer";
}
