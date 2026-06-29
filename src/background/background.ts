import { toErrorMessage } from "./common";
import { getSyncedMessage, readConfig, writeConfig } from "./storage";
import { saveUserConfig, testConnection } from "./settings";
import { syncPair } from "./sync";import { CONFIG_STORAGE_KEY, createDefaultConfig, isRecord, type RuntimeRequest, type RuntimeResponse } from "../shared/config";
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);

  if (!stored[CONFIG_STORAGE_KEY]) {
    await writeConfig(createDefaultConfig());
  }
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRuntimeRequest(message)) {
    return false;
  }

  void handleRuntimeRequest(message).then(
    (response) => sendResponse(response),
    (error) => sendResponse({ ok: false, message: toErrorMessage(error) } satisfies RuntimeResponse),
  );

  return true;
});

async function handleRuntimeRequest(message: RuntimeRequest): Promise<RuntimeResponse> {
  switch (message.type) {
    case "chat2notion:getConfig":
      return { ok: true, config: await readConfig() };
    case "chat2notion:saveConfig":
      return saveUserConfig(message.config);
    case "chat2notion:testConnection":
      return testConnection(message.config);
    case "chat2notion:isSynced": {
      const syncedMessage = await getSyncedMessage(message.messageId);
      return { ok: true, synced: Boolean(syncedMessage), notionPageId: syncedMessage?.notionPageId };
    }
    case "chat2notion:syncPair":
      return syncPair(message.payload, Boolean(message.overwrite));
  }
}

function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  return isRecord(value) && typeof value.type === "string" && value.type.startsWith("chat2notion:");
}
