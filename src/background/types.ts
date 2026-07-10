// Types specific to the background worker's Notion integration.
// These are separate from the shared config types because they describe
// Notion API response shapes, not user-facing configuration.

// The Notion data source info returned after ensuring a target database/data source.
export interface NotionDataSourceInfo {
  id: string;
  databaseId: string;
  properties: Record<string, { type?: string; selectOptions?: string[] }>;
  createdDatabase?: boolean;
  initializedSchema?: boolean;
}

// Minimal page shape returned by Notion create/update operations.
export interface NotionPageResponse {
  id?: string;
}

// A single message's sync record stored in chrome.storage.local.
export interface SyncedMessageRecord {
  syncedAt: string;
  notionPageId: string;
}

// The 8 required properties Chat2Notion expects on every target Notion database.
// Used for schema validation, creation, and patching.
export const REQUIRED_PROPERTIES = {
  Name: "title",
  Question: "rich_text",
  Answer: "rich_text",
  AI: "select",
  "Source URL": "url",
  "Synced At": "date",
  "Message ID": "rich_text",
  "Sync Mode": "select",
} as const;

// Key-level type derived from REQUIRED_PROPERTIES.
export type RequiredPropertyName = keyof typeof REQUIRED_PROPERTIES;

// Value-level type derived from REQUIRED_PROPERTIES.
export type NotionPropertyType = (typeof REQUIRED_PROPERTIES)[RequiredPropertyName];
