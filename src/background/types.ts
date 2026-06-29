export interface NotionDataSourceInfo {
  id: string;
  databaseId: string;
  properties: Record<string, { type?: string; selectOptions?: string[] }>;
  createdDatabase?: boolean;
  initializedSchema?: boolean;
}

export interface NotionPageResponse {
  id?: string;
}

export interface SyncedMessageRecord {
  syncedAt: string;
  notionPageId: string;
}

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


export type RequiredPropertyName = keyof typeof REQUIRED_PROPERTIES;
export type NotionPropertyType = (typeof REQUIRED_PROPERTIES)[RequiredPropertyName];
