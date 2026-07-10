// Save user configuration and test Notion API connectivity.
// Both operations persist config locally first, so a failed Notion setup
// does not erase the user's API key or database ID.

import type { Chat2NotionConfig, RuntimeResponse } from "../shared/config";
import { ensureChat2NotionTarget, describeTargetSetup } from "./notion-target";
import { normalizeNotionId, readConfig, writeConfig } from "./storage";
import { toErrorMessage } from "./common";

// Save the user-provided config (API key, database ID, auto-sync toggle).
// If credentials are present, also ensure the Notion target exists and
// update the stored dataSourceId. The save always succeeds locally;
// Notion setup errors are reported in the response message.
export async function saveUserConfig(
  input: Pick<Chat2NotionConfig, "apiKey" | "databaseId" | "autoSyncEnabled">,
): Promise<RuntimeResponse> {
  const current = await readConfig();
  const apiKey = input.apiKey.trim();
  const databaseId = normalizeNotionId(input.databaseId);
  const savedConfig = {
    ...current,
    apiKey,
    databaseId,
    dataSourceId: "",
    autoSyncEnabled: input.autoSyncEnabled,
    updatedAt: new Date().toISOString(),
  };

  await writeConfig(savedConfig);

  if (!apiKey || !databaseId) {
    return { ok: true, message: "Configuration saved.", dataSourceId: "" };
  }

  try {
    const target = await ensureChat2NotionTarget(apiKey, databaseId);
    await writeConfig({
      ...savedConfig,
      databaseId: target.databaseId,
      dataSourceId: target.id,
      updatedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      message: `Configuration saved. ${describeTargetSetup(target)}`,
      dataSourceId: target.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Configuration saved locally, but Notion setup failed: ${toErrorMessage(error)}`,
    };
  }
}

// Test the Notion API connection using the provided or currently stored credentials.
// Saves the tested config locally first so a successful connection is remembered.
export async function testConnection(input?: Pick<Chat2NotionConfig, "apiKey" | "databaseId">): Promise<RuntimeResponse> {
  const current = await readConfig();
  const apiKey = (input?.apiKey ?? current.apiKey).trim();
  const databaseId = normalizeNotionId(input?.databaseId ?? current.databaseId);
  const savedConfig = {
    ...current,
    apiKey,
    databaseId,
    dataSourceId: "",
    updatedAt: new Date().toISOString(),
  };

  await writeConfig(savedConfig);

  if (!apiKey) {
    return { ok: false, message: "Enter a Notion API key first." };
  }

  if (!databaseId) {
    return { ok: false, message: "Enter a database ID first." };
  }

  const dataSource = await ensureChat2NotionTarget(apiKey, databaseId);
  await writeConfig({
    ...savedConfig,
    apiKey,
    databaseId: dataSource.databaseId,
    dataSourceId: dataSource.id,
    updatedAt: new Date().toISOString(),
  });

  return { ok: true, message: `Connected to Notion. ${describeTargetSetup(dataSource)}`, dataSourceId: dataSource.id };
}
