import type { ChatPairPayload } from "../shared/config";
import { createTitleFromQuestion, MAX_RICH_TEXT_CHUNKS, splitRichText } from "../shared/text";
import { getByteLength } from "./request-size";

const NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES = 420_000;
const PROPERTY_PREVIEW_CHARACTER_LIMIT = 12_000;

export function toRichText(text: string): Array<{ type: "text"; text: { content: string } }> {
  return splitRichText(text).map((content) => ({ type: "text", text: { content } }));
}

export function toNotionText(content: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content } }];
}

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

export function createPageRequestBody(payload: ChatPairPayload, usePropertyPreview: boolean): Record<string, unknown> {
  return {
    parent: { data_source_id: "" },
    properties: createPageProperties(payload, usePropertyPreview),
  };
}

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

export function withPageParent(bodyJson: string, dataSourceId: string): string {
  const body = JSON.parse(bodyJson) as { parent?: unknown };
  body.parent = { data_source_id: dataSourceId };
  return JSON.stringify(body);
}

export function canUseFullPropertyValue(value: string): boolean {
  return splitRichText(value).length <= MAX_RICH_TEXT_CHUNKS;
}

export function toPropertyValue(value: string, usePreview: boolean): string {
  if (!usePreview && canUseFullPropertyValue(value)) {
    return value;
  }

  const preview = value.slice(0, PROPERTY_PREVIEW_CHARACTER_LIMIT).trimEnd();
  const suffix = value.length > preview.length ? "\n\n[Full content is saved in the Notion page body.]" : "";
  return `${preview}${suffix}`;
}
