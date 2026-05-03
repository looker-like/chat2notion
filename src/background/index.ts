import { createDefaultConfig, CONFIG_STORAGE_KEY } from "../shared/config";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);

  if (!stored[CONFIG_STORAGE_KEY]) {
    await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: createDefaultConfig() });
  }
});
