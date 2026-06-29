import {
  CONFIG_STORAGE_KEY,
  normalizeConfig,
  type Chat2NotionConfig,
  isRecord,
  type SyncStatus,
  SYNCED_MESSAGES_STORAGE_KEY,
} from "../shared/config";
import type { SyncedMessageRecord } from "./types";

export async function readConfig(): Promise<Chat2NotionConfig> {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  return normalizeConfig(stored[CONFIG_STORAGE_KEY]);
}

export async function writeConfig(config: Chat2NotionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalizeConfig(config) });
}

export async function updateLastSyncStatus(status: SyncStatus): Promise<void> {
  const config = await readConfig();
  await writeConfig({ ...config, lastSyncStatus: status, updatedAt: new Date().toISOString() });
}

export async function getSyncedMessages(): Promise<Record<string, SyncedMessageRecord>> {
  const stored = await chrome.storage.local.get(SYNCED_MESSAGES_STORAGE_KEY);
  return readSyncedMessages(stored[SYNCED_MESSAGES_STORAGE_KEY]);
}

export async function getSyncedMessage(messageId: string): Promise<SyncedMessageRecord | null> {
  const messages = await getSyncedMessages();
  return messages[messageId] ?? null;
}

export async function markMessageSynced(messageId: string, notionPageId: string): Promise<void> {
  const messages = await getSyncedMessages();
  messages[messageId] = {
    syncedAt: new Date().toISOString(),
    notionPageId,
  };
  await chrome.storage.local.set({ [SYNCED_MESSAGES_STORAGE_KEY]: messages });
}

export function readSyncedMessages(value: unknown): Record<string, SyncedMessageRecord> {
  if (!isRecord(value)) {
    return {};
  }

  const messages: Record<string, SyncedMessageRecord> = {};

  for (const [messageId, item] of Object.entries(value)) {
    if (typeof item === "string") {
      messages[messageId] = { syncedAt: item, notionPageId: "" };
      continue;
    }

    if (isRecord(item) && typeof item.syncedAt === "string") {
      messages[messageId] = {
        syncedAt: item.syncedAt,
        notionPageId: typeof item.notionPageId === "string" ? item.notionPageId : "",
      };
    }
  }

  return messages;
}

export function normalizeNotionId(value: string): string {
  const trimmed = value.trim();
  const uuidMatch = trimmed.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return (uuidMatch?.[0] ?? trimmed).replace(/-/g, "");
}
