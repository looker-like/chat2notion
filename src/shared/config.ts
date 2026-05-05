export const CONFIG_STORAGE_KEY = "chat2notionConfig";
export const SYNCED_MESSAGES_STORAGE_KEY = "chat2notionSyncedMessages";
export const CONVERSATION_AUTO_SYNC_STORAGE_KEY = "chat2notionConversationAutoSync";
export const NOTION_VERSION = "2026-03-11";

export interface Chat2NotionConfig {
  apiKey: string;
  databaseId: string;
  dataSourceId: string;
  autoSyncEnabled: boolean;
  lastSyncStatus: SyncStatus | null;
  updatedAt: string;
}

export type SyncTone = "idle" | "success" | "error" | "pending";

export interface SyncStatus {
  tone: SyncTone;
  message: string;
  at: string;
}

export interface ChatPairPayload {
  messageId: string;
  question: string;
  questionMarkdown?: string;
  answer: string;
  answerMarkdown?: string;
  sourceUrl: string;
  syncMode: "manual" | "auto";
}

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

export type RuntimeRequest =
  | { type: "chat2notion:getConfig" }
  | { type: "chat2notion:saveConfig"; config: Pick<Chat2NotionConfig, "apiKey" | "databaseId" | "autoSyncEnabled"> }
  | { type: "chat2notion:testConnection"; config?: Pick<Chat2NotionConfig, "apiKey" | "databaseId"> }
  | { type: "chat2notion:syncPair"; payload: ChatPairPayload }
  | { type: "chat2notion:isSynced"; messageId: string };

export type RuntimeResponse =
  | { ok: true; config: Chat2NotionConfig }
  | { ok: true; message: string; dataSourceId?: string }
  | { ok: true; synced: boolean }
  | SyncResponse;

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSyncStatus(value: unknown): value is SyncStatus {
  return (
    isRecord(value) &&
    (value.tone === "idle" || value.tone === "success" || value.tone === "error" || value.tone === "pending") &&
    typeof value.message === "string" &&
    typeof value.at === "string"
  );
}
