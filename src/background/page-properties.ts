// Build Notion page request bodies and handle request size limits.
// If the full question/answer would make the request too large, those
// properties are downgraded to previews (truncated with a note) while
// the full content remains in the page body Markdown backup.

import type { ChatPairPayload } from "../shared/config";
import { createTitleFromQuestion, MAX_RICH_TEXT_CHUNKS, splitRichText } from "../shared/text";
import { getByteLength } from "./request-size";

const NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES = 420_000;
const PROPERTY_PREVIEW_CHARACTER_LIMIT = 12_000;

// Build the rich_text array for a Notion property value, splitting into chunks if needed.
export function toRichText(text: string): Array<{ type: "text"; text: { content: string } }> {
  return splitRichText(text).map((content) => ({ type: "text", text: { content } }));
}

// Build a single-chunk rich_text value for short strings.
export function toNotionText(content: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content } }];
}

// Build the full page creation request body as a JSON string.
// If the request is too large or the text exceeds rich_text chunk limits,
// the question/answer properties become truncated previews.
export function createPageRequestBodyJson(payload: ChatPairPayload): string {
  const fullBodyJson = JSON.stringify(createPageRequestBody(payload, false));

  if (
    getByteLength(fullBodyJson) <= NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES &&
    canUseFullPropertyValue(payload.question) &&
    canUseFullPropertyValue(payload.answer)
  ) {
    return fullBodyJson;
  }

  return JSON.stringify(createPageRequestBody(payload, true));
}

// Build the properties-only update request body as a JSON string.
// Same size-limit logic as createPageRequestBodyJson.
export function createPagePropertiesBodyJson(payload: ChatPairPayload): string {
  const fullBodyJson = JSON.stringify({ properties: createPageProperties(payload, false) });

  if (
    getByteLength(fullBodyJson) <= NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES &&
    canUseFullPropertyValue(payload.question) &&
    canUseFullPropertyValue(payload.answer)
  ) {
    return fullBodyJson;
  }

  return JSON.stringify({ properties: createPageProperties(payload, true) });
}

// Build the raw page request body object (before JSON serialization).
export function createPageRequestBody(payload: ChatPairPayload, usePropertyPreview: boolean): Record<string, unknown> {
  return {
    parent: { data_source_id: "" },
    properties: createPageProperties(payload, usePropertyPreview),
  };
}

// Build all 8 required Notion page properties from a chat pair payload.
export function createPageProperties(payload: ChatPairPayload, usePropertyPreview: boolean): Record<string, unknown> {
  return {
    Name: {
      title: [{ type: "text", text: { content: createTitleFromQuestion(payload.question) } }],
    },
    Question: { rich_text: toRichText(toPropertyValue(payload.question, usePropertyPreview)) },
    Answer: { rich_text: toRichText(toPropertyValue(payload.answer, usePropertyPreview)) },
    AI: { select: { name: payload.aiName || "ChatGPT" } },
    "Source URL": { url: payload.sourceUrl },
    "Synced At": { date: { start: new Date().toISOString() } },
    "Message ID": { rich_text: toRichText(payload.messageId) },
    "Sync Mode": { select: { name: payload.syncMode } },
  };
}

// Replace the placeholder parent in a serialized request body with the real data source ID.
export function withPageParent(bodyJson: string, dataSourceId: string): string {
  const body = JSON.parse(bodyJson) as { parent?: unknown };
  body.parent = { data_source_id: dataSourceId };
  return JSON.stringify(body);
}

// Whether a property value can be stored in full without exceeding Notion's chunk limits.
export function canUseFullPropertyValue(value: string): boolean {
  return splitRichText(value).length <= MAX_RICH_TEXT_CHUNKS;
}

// Return the full value, or a truncated preview with a note if the value is too long.
export function toPropertyValue(value: string, usePreview: boolean): string {
  if (!usePreview && canUseFullPropertyValue(value)) {
    return value;
  }

  const preview = value.slice(0, PROPERTY_PREVIEW_CHARACTER_LIMIT).trimEnd();
  const suffix = value.length > preview.length ? "\n\n[Full content is saved in the Notion page body.]" : "";
  return `${preview}${suffix}`;
}
