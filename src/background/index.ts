import {
  CONFIG_STORAGE_KEY,
  createDefaultConfig,
  type Chat2NotionConfig,
  type ChatPairPayload,
  isRecord,
  normalizeConfig,
  NOTION_VERSION,
  type RuntimeRequest,
  type RuntimeResponse,
  type SyncStatus,
  SYNCED_MESSAGES_STORAGE_KEY,
} from "../shared/config";
import { assertRichTextFitsNotion, createTitleFromQuestion, splitRichText } from "../shared/text";

const NOTION_API_BASE = "https://api.notion.com/v1";
const REQUIRED_PROPERTIES = {
  Name: "title",
  Question: "rich_text",
  Answer: "rich_text",
  AI: "select",
  "Source URL": "url",
  "Synced At": "date",
  "Message ID": "rich_text",
  "Sync Mode": "select",
} as const;

type RequiredPropertyName = keyof typeof REQUIRED_PROPERTIES;
type NotionPropertyType = (typeof REQUIRED_PROPERTIES)[RequiredPropertyName];

interface NotionDataSourceInfo {
  id: string;
  properties: Record<string, { type?: string }>;
}

interface NotionPageResponse {
  id?: string;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);

  if (!stored[CONFIG_STORAGE_KEY]) {
    await writeConfig(createDefaultConfig());
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
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
    case "chat2notion:isSynced":
      return { ok: true, synced: await isMessageSynced(message.messageId) };
    case "chat2notion:syncPair":
      return syncPair(message.payload);
  }
}

async function saveUserConfig(input: Pick<Chat2NotionConfig, "apiKey" | "databaseId" | "autoSyncEnabled">): Promise<RuntimeResponse> {
  const current = await readConfig();
  const apiKey = input.apiKey.trim();
  const databaseId = normalizeNotionId(input.databaseId);
  let dataSourceId = "";

  if (apiKey && databaseId) {
    const dataSource = await resolveAndValidateDataSource(apiKey, databaseId);
    dataSourceId = dataSource.id;
  }

  await writeConfig({
    ...current,
    apiKey,
    databaseId,
    dataSourceId,
    autoSyncEnabled: input.autoSyncEnabled,
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    message: apiKey && databaseId ? "Configuration saved and Notion database validated." : "Configuration saved.",
    dataSourceId,
  };
}

async function testConnection(input?: Pick<Chat2NotionConfig, "apiKey" | "databaseId">): Promise<RuntimeResponse> {
  const current = await readConfig();
  const apiKey = (input?.apiKey ?? current.apiKey).trim();
  const databaseId = normalizeNotionId(input?.databaseId ?? current.databaseId);

  if (!apiKey) {
    return { ok: false, message: "Enter a Notion API key first." };
  }

  if (!databaseId) {
    return { ok: false, message: "Enter a Notion database ID first." };
  }

  const dataSource = await resolveAndValidateDataSource(apiKey, databaseId);
  await writeConfig({
    ...current,
    apiKey,
    databaseId,
    dataSourceId: dataSource.id,
    updatedAt: new Date().toISOString(),
  });

  return { ok: true, message: "Connected to Notion and verified required properties.", dataSourceId: dataSource.id };
}

async function syncPair(payload: ChatPairPayload): Promise<RuntimeResponse> {
  if (await isMessageSynced(payload.messageId)) {
    return { ok: true, notionPageId: "", message: "Already synced." };
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
      const dataSource = await resolveAndValidateDataSource(config.apiKey, config.databaseId);
      dataSourceId = dataSource.id;
      await writeConfig({ ...config, dataSourceId, updatedAt: new Date().toISOString() });
    }

    const page = await createNotionPage(config.apiKey, dataSourceId, payload);
    await markMessageSynced(payload.messageId);

    const status: SyncStatus = {
      tone: "success",
      message: "Synced to Notion.",
      at: new Date().toISOString(),
    };
    await updateLastSyncStatus(status);

    return { ok: true, notionPageId: page.id ?? "", message: status.message };
  } catch (error) {
    const message = toErrorMessage(error);
    await updateLastSyncStatus({ tone: "error", message, at: new Date().toISOString() });
    return { ok: false, message };
  }
}

async function createNotionPage(apiKey: string, dataSourceId: string, payload: ChatPairPayload): Promise<NotionPageResponse> {
  const body = {
    parent: { data_source_id: dataSourceId },
    properties: {
      Name: {
        title: [{ type: "text", text: { content: createTitleFromQuestion(payload.question) } }],
      },
      Question: { rich_text: toRichText(payload.question) },
      Answer: { rich_text: toRichText(payload.answer) },
      AI: { select: { name: "ChatGPT" } },
      "Source URL": { url: payload.sourceUrl },
      "Synced At": { date: { start: new Date().toISOString() } },
      "Message ID": { rich_text: toRichText(payload.messageId) },
      "Sync Mode": { select: { name: payload.syncMode } },
    },
  };

  return notionFetch<NotionPageResponse>(apiKey, "/pages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function resolveAndValidateDataSource(apiKey: string, databaseId: string): Promise<NotionDataSourceInfo> {
  const database = await notionFetch<unknown>(apiKey, `/databases/${encodeURIComponent(databaseId)}`, { method: "GET" });
  const dataSourceId = extractDataSourceId(database) || databaseId;
  const dataSource = await retrieveDataSource(apiKey, dataSourceId, database);
  validateRequiredProperties(dataSource.properties);
  return dataSource;
}

async function retrieveDataSource(apiKey: string, dataSourceId: string, databaseFallback: unknown): Promise<NotionDataSourceInfo> {
  try {
    const dataSource = await notionFetch<unknown>(apiKey, `/data_sources/${encodeURIComponent(dataSourceId)}`, { method: "GET" });
    return {
      id: extractString(dataSource, "id") || dataSourceId,
      properties: extractProperties(dataSource),
    };
  } catch (error) {
    const fallbackProperties = extractProperties(databaseFallback);

    if (Object.keys(fallbackProperties).length > 0) {
      return { id: dataSourceId, properties: fallbackProperties };
    }

    throw error;
  }
}

function extractDataSourceId(database: unknown): string {
  if (!isRecord(database)) {
    return "";
  }

  const directDataSources = Array.isArray(database.data_sources) ? database.data_sources : [];
  const firstDirect = directDataSources.find(isRecord);
  const directId = firstDirect ? extractString(firstDirect, "id") : "";

  if (directId) {
    return directId;
  }

  const results = isRecord(database.data_sources) && Array.isArray(database.data_sources.results)
    ? database.data_sources.results
    : Array.isArray(database.results)
      ? database.results
      : [];
  const firstResult = results.find(isRecord);

  return firstResult ? extractString(firstResult, "id") : "";
}

function extractProperties(value: unknown): Record<string, { type?: string }> {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return {};
  }

  const properties: Record<string, { type?: string }> = {};

  Object.entries(value.properties).forEach(([name, property]) => {
    if (isRecord(property)) {
      properties[name] = { type: typeof property.type === "string" ? property.type : undefined };
    }
  });

  return properties;
}

function validateRequiredProperties(properties: Record<string, { type?: string }>): void {
  const missingOrInvalid = Object.entries(REQUIRED_PROPERTIES).flatMap(([name, expectedType]) => {
    const actualType = properties[name]?.type;
    return actualType === expectedType ? [] : [`${name} (${expectedType})`];
  });

  if (missingOrInvalid.length > 0) {
    throw new Error(`Notion database is missing required properties: ${missingOrInvalid.join(", ")}.`);
  }
}

async function notionFetch<T>(apiKey: string, path: string, init: RequestInit, retry = true): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 429 && retry) {
    await waitForRetryAfter(response.headers.get("Retry-After"));
    return notionFetch<T>(apiKey, path, init, false);
  }

  if (!response.ok) {
    throw new Error(await readNotionError(response));
  }

  return response.json() as Promise<T>;
}

async function readNotionError(response: Response): Promise<string> {
  try {
    const body = await response.json();

    if (isRecord(body) && typeof body.message === "string") {
      return `Notion API error ${response.status}: ${body.message}`;
    }
  } catch {
    // Use fallback below.
  }

  return `Notion API error ${response.status}: ${response.statusText}`;
}

async function waitForRetryAfter(value: string | null): Promise<void> {
  const seconds = Number(value);
  const delayMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
}

function toRichText(text: string): Array<{ type: "text"; text: { content: string } }> {
  return splitRichText(text).map((content) => ({ type: "text", text: { content } }));
}

function assertSyncPayload(payload: ChatPairPayload): void {
  if (!payload.messageId.trim()) {
    throw new Error("Cannot sync without a message ID.");
  }

  if (!payload.question.trim()) {
    throw new Error("Cannot sync because the matching question is empty.");
  }

  if (!payload.answer.trim()) {
    throw new Error("Cannot sync because the answer is empty.");
  }

  assertRichTextFitsNotion(payload.question, "Question");
  assertRichTextFitsNotion(payload.answer, "Answer");
}

async function readConfig(): Promise<Chat2NotionConfig> {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  return normalizeConfig(stored[CONFIG_STORAGE_KEY]);
}

async function writeConfig(config: Chat2NotionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalizeConfig(config) });
}

async function updateLastSyncStatus(status: SyncStatus): Promise<void> {
  const config = await readConfig();
  await writeConfig({ ...config, lastSyncStatus: status, updatedAt: new Date().toISOString() });
}

async function getSyncedMessages(): Promise<Record<string, string>> {
  const stored = await chrome.storage.local.get(SYNCED_MESSAGES_STORAGE_KEY);
  return isStringRecord(stored[SYNCED_MESSAGES_STORAGE_KEY]) ? stored[SYNCED_MESSAGES_STORAGE_KEY] : {};
}

async function isMessageSynced(messageId: string): Promise<boolean> {
  const messages = await getSyncedMessages();
  return Boolean(messages[messageId]);
}

async function markMessageSynced(messageId: string): Promise<void> {
  const messages = await getSyncedMessages();
  messages[messageId] = new Date().toISOString();
  await chrome.storage.local.set({ [SYNCED_MESSAGES_STORAGE_KEY]: messages });
}

function normalizeNotionId(value: string): string {
  const trimmed = value.trim();
  const uuidMatch = trimmed.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return (uuidMatch?.[0] ?? trimmed).replace(/-/g, "");
}

function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  return isRecord(value) && typeof value.type === "string" && value.type.startsWith("chat2notion:");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function extractString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Chat2Notion error.";
}
