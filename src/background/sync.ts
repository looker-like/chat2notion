// Core sync orchestration for the background worker.
// Coordinates config reading, Notion target resolution, page creation/update,
// and storage of the sync result.

import type { RuntimeResponse, ChatPairPayload, SyncStatus } from "../shared/config";
import { ensureChat2NotionTarget } from "./notion-target";
import { assertSyncPayload, createNotionPage, resolveSyncedPageId, updateNotionPage } from "./notion-pages";
import { getSyncedMessage, markMessageSynced, readConfig, updateLastSyncStatus, writeConfig } from "./storage";
import { toErrorMessage } from "./common";

// Sync a chat pair to Notion: create a new page or update an existing one.
export async function syncPair(payload: ChatPairPayload, overwrite: boolean): Promise<RuntimeResponse> {
  const existingSync = await getSyncedMessage(payload.messageId);

  if (existingSync && !overwrite) {
    return { ok: true, notionPageId: existingSync.notionPageId, message: "Already synced." };
  }

  const config = await readConfig();

  if (!config.apiKey || !config.databaseId) {
    const message = "Configure Notion API key and database ID before syncing.";
    await updateLastSyncStatus({ tone: "error", message, at: new Date().toISOString() });
    return { ok: false, message };
  }

  try {
    assertSyncPayload(payload);
    let dataSourceId = config.dataSourceId;

    if (!dataSourceId) {
      const dataSource = await ensureChat2NotionTarget(config.apiKey, config.databaseId);
      dataSourceId = dataSource.id;
      await writeConfig({
        ...config,
        databaseId: dataSource.databaseId,
        dataSourceId,
        updatedAt: new Date().toISOString(),
      });
    }

    const targetPageId = overwrite
      ? await resolveSyncedPageId(config.apiKey, dataSourceId, payload.messageId, existingSync?.notionPageId ?? "")
      : "";
    const page = targetPageId
      ? await updateNotionPage(config.apiKey, targetPageId, payload)
      : await createNotionPage(config.apiKey, dataSourceId, payload);
    const notionPageId = page.id ?? targetPageId;

    await markMessageSynced(payload.messageId, notionPageId);

    const status: SyncStatus = {
      tone: "success",
      message: targetPageId
        ? "Resynced to Notion."
        : overwrite
          ? "Original Notion page was not found; created a replacement."
          : "Synced to Notion.",
      at: new Date().toISOString(),
    };
    await updateLastSyncStatus(status);

    return { ok: true, notionPageId, message: status.message };
  } catch (error) {
    const message = toErrorMessage(error);
    await updateLastSyncStatus({ tone: "error", message, at: new Date().toISOString() });
    return { ok: false, message };
  }
}
