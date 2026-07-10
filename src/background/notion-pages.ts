// Notion page lifecycle: create, update, and resolve pages for a chat pair sync.
// Also handles appending/replacing the Markdown backup in the page body.

import { isRecord, type ChatPairPayload } from "../shared/config";
import type { NotionPageResponse } from "./types";
import { extractString, isNotionApiError } from "./common";
import { createPageMarkdownBackup, splitMarkdownForNotion } from "./markdown-backup";
import { notionFetch } from "./notion-client";
import {
  createPagePropertiesBodyJson,
  createPageRequestBodyJson,
  withPageParent,
} from "./page-properties";
import { assertNotionRequestFits } from "./request-size";

// Create a new Notion page for the given chat pair.
export async function createNotionPage(
  apiKey: string,
  dataSourceId: string,
  payload: ChatPairPayload,
): Promise<NotionPageResponse> {
  const bodyJson = withPageParent(createPageRequestBodyJson(payload), dataSourceId);

  assertNotionRequestFits(bodyJson, "Notion page property request");

  const page = await notionFetch<NotionPageResponse>(apiKey, "/pages", {
    method: "POST",
    body: bodyJson,
  });

  if (!page.id) {
    throw new Error("Notion created a page but did not return its ID.");
  }

  await appendPageMarkdownBackup(apiKey, page.id, createPageMarkdownBackup(payload));
  return page;
}

// Update an existing Notion page with new chat pair data.
export async function updateNotionPage(apiKey: string, pageId: string, payload: ChatPairPayload): Promise<NotionPageResponse> {
  const bodyJson = createPagePropertiesBodyJson(payload);

  assertNotionRequestFits(bodyJson, "Notion page property update request");

  const page = await notionFetch<NotionPageResponse>(apiKey, `/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: bodyJson,
  });

  await replacePageMarkdownBackup(apiKey, page.id ?? pageId, createPageMarkdownBackup(payload));
  return { ...page, id: page.id ?? pageId };
}

// Resolve the actual Notion page ID for a resync operation.
// Prefers the stored page ID if the page is still accessible;
// otherwise queries the data source by Message ID to find a replacement.
export async function resolveSyncedPageId(
  apiKey: string,
  dataSourceId: string,
  messageId: string,
  storedPageId: string,
): Promise<string> {
  if (storedPageId && (await canAccessPage(apiKey, storedPageId))) {
    return storedPageId;
  }

  return findSyncedPageIdByMessageId(apiKey, dataSourceId, messageId);
}

// Check whether a specific Notion page ID is still accessible to the API key.
export async function canAccessPage(apiKey: string, pageId: string): Promise<boolean> {
  try {
    await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}`, { method: "GET" });
    return true;
  } catch (error) {
    if (isNotionApiError(error, 404)) {
      return false;
    }

    throw error;
  }
}

// Query the data source for a page with the given Message ID property.
export async function findSyncedPageIdByMessageId(apiKey: string, dataSourceId: string, messageId: string): Promise<string> {
  const response = await notionFetch<unknown>(apiKey, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: "Message ID",
        rich_text: {
          equals: messageId,
        },
      },
    }),
  });

  if (!isRecord(response) || !Array.isArray(response.results)) {
    return "";
  }

  const firstPage = response.results.find(isRecord);
  return firstPage ? extractString(firstPage, "id") : "";
}

// Append Markdown content chunks to a Notion page body.
export async function appendPageMarkdownBackup(apiKey: string, pageId: string, markdown: string): Promise<void> {
  const chunks = splitMarkdownForNotion(markdown);

  for (const chunk of chunks) {
    const bodyJson = JSON.stringify({
      type: "insert_content",
      insert_content: {
        content: chunk,
      },
    });

    assertNotionRequestFits(bodyJson, "Notion markdown backup chunk");

    await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}/markdown`, {
      method: "PATCH",
      body: bodyJson,
    });
  }
}

// Replace the Markdown backup of an existing Notion page, then append remaining chunks.
export async function replacePageMarkdownBackup(apiKey: string, pageId: string, markdown: string): Promise<void> {
  const [firstChunk = "No content captured.", ...remainingChunks] = splitMarkdownForNotion(markdown);
  const bodyJson = JSON.stringify({
    type: "replace_content",
    replace_content: {
      new_str: firstChunk,
    },
  });

  assertNotionRequestFits(bodyJson, "Notion markdown replacement chunk");

  await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}/markdown`, {
    method: "PATCH",
    body: bodyJson,
  });

  for (const chunk of remainingChunks) {
    const appendBodyJson = JSON.stringify({
      type: "insert_content",
      insert_content: {
        content: chunk,
      },
    });

    assertNotionRequestFits(appendBodyJson, "Notion markdown backup chunk");

    await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}/markdown`, {
      method: "PATCH",
      body: appendBodyJson,
    });
  }
}

// Validate that a sync payload has the required non-empty fields before sending to Notion.
export function assertSyncPayload(payload: ChatPairPayload): void {
  if (!payload.messageId.trim()) {
    throw new Error("Cannot sync without a message ID.");
  }

  if (!payload.question.trim()) {
    throw new Error("Cannot sync because the matching question is empty.");
  }

  if (!payload.answer.trim()) {
    throw new Error("Cannot sync because the answer is empty.");
  }
}
