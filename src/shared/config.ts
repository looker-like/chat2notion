// Shared extension constants, types, and config contracts.
// Imported by both background and content contexts.

// Storage keys for chrome.storage.local
export const CONFIG_STORAGE_KEY = "chat2notionConfig";
export const SYNCED_MESSAGES_STORAGE_KEY = "chat2notionSyncedMessages";
export const CONVERSATION_AUTO_SYNC_STORAGE_KEY = "chat2notionConversationAutoSync";

// Notion API version pinned to avoid breaking changes from Notion's side.
export const NOTION_VERSION = "2026-03-11";

// User-facing configuration persisted in chrome.storage.local.
export interface Chat2NotionConfig {
  apiKey: string;
  databaseId: string;
  dataSourceId: string;
  autoSyncEnabled: boolean;
  lastSyncStatus: SyncStatus | null;
  updatedAt: string;
}

// Visual tone for sync status labels shown in the popup.
export type SyncTone = "idle" | "success" | "error" | "pending";

export interface SyncStatus {
  tone: SyncTone;
  message: string;
  at: string;
}

// Payload sent from the content script to the background worker.
export interface ChatPairPayload {
  messageId: string;
  aiName?: string;
  question: string;
  questionMarkdown?: string;
  answer: string;
  answerMarkdown?: string;
  sourceUrl: string;
  syncMode: "manual" | "auto";
}

// Discriminated response shapes for the runtime message protocol.
export interface SyncSuccessResponse {
  ok: true;
  notionPageId: string;
  message: string;
}

export interface SyncErrorResponse {
  ok: false;
  message: string;
}

export type SyncResponse = SyncSuccessResponse | SyncErrorResponse;

// All runtime messages routed through chrome.runtime.sendMessage.
export type RuntimeRequest =
  | { type: "chat2notion:getConfig" }
  | { type: "chat2notion:saveConfig"; config: Pick<Chat2NotionConfig, "apiKey" | "databaseId" | "autoSyncEnabled"> }
  | { type: "chat2notion:testConnection"; config?: Pick<Chat2NotionConfig, "apiKey" | "databaseId"> }
  | { type: "chat2notion:syncPair"; payload: ChatPairPayload; overwrite?: boolean }
  | { type: "chat2notion:isSynced"; messageId: string };

// All possible responses from the background worker.
export type RuntimeResponse =
  | { ok: true; config: Chat2NotionConfig }
  | { ok: true; message: string; dataSourceId?: string }
  | { ok: true; synced: boolean; notionPageId?: string }
  | SyncResponse;

// Create a fresh default config with empty credentials and disabled auto-sync.
export function createDefaultConfig(): Chat2NotionConfig {
  return {
    apiKey: "",
    databaseId: "",
    dataSourceId: "",
    autoSyncEnabled: false,
    lastSyncStatus: null,
    updatedAt: new Date().toISOString(),
  };
}

// Defensively coerce unknown storage data back into a Chat2NotionConfig.
// Missing or malformed fields are replaced with safe defaults.
export function normalizeConfig(value: unknown): Chat2NotionConfig {
  if (!isRecord(value)) {
    return createDefaultConfig();
  }

  return {
    apiKey: typeof value.apiKey === "string" ? value.apiKey : "",
    databaseId: typeof value.databaseId === "string" ? value.databaseId : "",
    dataSourceId: typeof value.dataSourceId === "string" ? value.dataSourceId : "",
    autoSyncEnabled: typeof value.autoSyncEnabled === "boolean" ? value.autoSyncEnabled : false,
    lastSyncStatus: isSyncStatus(value.lastSyncStatus) ? value.lastSyncStatus : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

// Narrowing guard for plain objects (not arrays, not null).
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Narrowing guard for SyncStatus shape stored in config.
function isSyncStatus(value: unknown): value is SyncStatus {
  return (
    isRecord(value) &&
    (value.tone === "idle" || value.tone === "success" || value.tone === "error" || value.tone === "pending") &&
    typeof value.message === "string" &&
    typeof value.at === "string"
  );
}
