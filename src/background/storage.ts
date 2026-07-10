// Persistence layer for the background worker.
// All reads and writes go through chrome.storage.local via these helpers,
// which normalize stored data so corrupted or legacy records don't crash the extension.

import {
  CONFIG_STORAGE_KEY,
  normalizeConfig,
  type Chat2NotionConfig,
  isRecord,
  type SyncStatus,
  SYNCED_MESSAGES_STORAGE_KEY,
} from "../shared/config";
import type { SyncedMessageRecord } from "./types";

// Read the current Chat2Notion config from storage, normalizing any legacy shape.
export async function readConfig(): Promise<Chat2NotionConfig> {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  return normalizeConfig(stored[CONFIG_STORAGE_KEY]);
}

// Write a Chat2Notion config to storage after normalizing it.
export async function writeConfig(config: Chat2NotionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalizeConfig(config) });
}

// Update the lastSyncStatus field and the updatedAt timestamp on the config.
export async function updateLastSyncStatus(status: SyncStatus): Promise<void> {
  const config = await readConfig();
  await writeConfig({ ...config, lastSyncStatus: status, updatedAt: new Date().toISOString() });
}

// Read the full map of synced message IDs to their records.
export async function getSyncedMessages(): Promise<Record<string, SyncedMessageRecord>> {
  const stored = await chrome.storage.local.get(SYNCED_MESSAGES_STORAGE_KEY);
  return readSyncedMessages(stored[SYNCED_MESSAGES_STORAGE_KEY]);
}

// Look up a single message's sync record by its generated messageId.
export async function getSyncedMessage(messageId: string): Promise<SyncedMessageRecord | null> {
  const messages = await getSyncedMessages();
  return messages[messageId] ?? null;
}

// Record a message as synced, associating it with a Notion page ID.
export async function markMessageSynced(messageId: string, notionPageId: string): Promise<void> {
  const messages = await getSyncedMessages();
  messages[messageId] = {
    syncedAt: new Date().toISOString(),
    notionPageId,
  };
  await chrome.storage.local.set({ [SYNCED_MESSAGES_STORAGE_KEY]: messages });
}

// Coerce unknown storage data into a record of messageId -> SyncedMessageRecord.
// Handles both legacy string values (old format stored just a timestamp)
// and the current object format.
export function readSyncedMessages(value: unknown): Record<string, SyncedMessageRecord> {
  if (!isRecord(value)) {
    return {};
  }

  const messages: Record<string, SyncedMessageRecord> = {};

  for (const [messageId, item] of Object.entries(value)) {
    if (typeof item === "string") {
      // Legacy format: value was just the syncedAt timestamp string.
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

// Normalize a Notion database/page ID by extracting the UUID portion
// and stripping hyphens, so the user can paste either a full URL or a raw ID.
export function normalizeNotionId(value: string): string {
  const trimmed = value.trim();
  const uuidMatch = trimmed.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return (uuidMatch?.[0] ?? trimmed).replace(/-/g, "");
}
