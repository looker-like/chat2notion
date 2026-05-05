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
const DEFAULT_DATABASE_TITLE = "Chat2Notion";
const DEFAULT_DATA_SOURCE_TITLE = "Synced Chats";
const NOTION_REQUEST_BODY_LIMIT_BYTES = 500_000;

type RequiredPropertyName = keyof typeof REQUIRED_PROPERTIES;
type NotionPropertyType = (typeof REQUIRED_PROPERTIES)[RequiredPropertyName];

interface NotionDataSourceInfo {
  id: string;
  databaseId: string;
  properties: Record<string, { type?: string }>;
  createdDatabase?: boolean;
  initializedSchema?: boolean;
}

interface NotionPageResponse {
  id?: string;
}

class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

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

async function testConnection(input?: Pick<Chat2NotionConfig, "apiKey" | "databaseId">): Promise<RuntimeResponse> {
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
    return { ok: false, message: "Enter a Notion database ID first." };
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
      const dataSource = await ensureChat2NotionTarget(config.apiKey, config.databaseId);
      dataSourceId = dataSource.id;
      await writeConfig({
        ...config,
        databaseId: dataSource.databaseId,
        dataSourceId,
        updatedAt: new Date().toISOString(),
      });
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
    markdown: createPageMarkdownBackup(payload),
  };
  const bodyJson = JSON.stringify(body);

  assertNotionRequestFits(bodyJson);

  return notionFetch<NotionPageResponse>(apiKey, "/pages", {
    method: "POST",
    body: bodyJson,
  });
}

async function ensureChat2NotionTarget(apiKey: string, databaseId: string): Promise<NotionDataSourceInfo> {
  try {
    return await ensureDatabaseTarget(apiKey, databaseId);
  } catch (databaseError) {
    if (!isNotionApiError(databaseError, 404)) {
      throw databaseError;
    }

    try {
      return await createDatabaseInEmptyPage(apiKey, databaseId);
    } catch (pageError) {
      if (isNotionApiError(pageError, 404)) {
        throw new Error(
          `Provided ID is not an accessible Notion database or page. Database check: ${toErrorMessage(databaseError)} Page check: ${toErrorMessage(pageError)}`,
        );
      }

      throw pageError;
    }
  }
}

async function ensureDatabaseTarget(apiKey: string, databaseId: string): Promise<NotionDataSourceInfo> {
  const database = await notionFetch<unknown>(apiKey, `/databases/${encodeURIComponent(databaseId)}`, { method: "GET" });
  const resolvedDatabaseId = extractString(database, "id") || databaseId;
  const dataSourceId = extractDataSourceId(database) || databaseId;
  const dataSource = await retrieveDataSource(apiKey, dataSourceId, database, resolvedDatabaseId);
  return initializeDataSourceProperties(apiKey, dataSource);
}

async function createDatabaseInEmptyPage(apiKey: string, pageId: string): Promise<NotionDataSourceInfo> {
  await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}`, { method: "GET" });

  if (!(await isPageEmpty(apiKey, pageId))) {
    throw new Error("Provided ID is a Notion page, but it is not empty. Use an empty page ID or an existing database ID.");
  }

  const database = await notionFetch<unknown>(apiKey, "/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: pageId },
      title: toNotionText(DEFAULT_DATABASE_TITLE),
      initial_data_source: {
        title: toNotionText(DEFAULT_DATA_SOURCE_TITLE),
        properties: createRequiredPropertiesSchema(),
      },
      is_inline: true,
    }),
  });
  const createdDatabaseId = extractString(database, "id");

  if (!createdDatabaseId) {
    throw new Error("Notion created a database but did not return its ID.");
  }

  const refreshedDatabase = await notionFetch<unknown>(apiKey, `/databases/${encodeURIComponent(createdDatabaseId)}`, { method: "GET" });
  const dataSourceId = extractDataSourceId(refreshedDatabase) || extractDataSourceId(database);

  if (!dataSourceId) {
    throw new Error("Notion created a database but did not return a data source ID.");
  }

  const dataSource = await retrieveDataSource(apiKey, dataSourceId, refreshedDatabase, createdDatabaseId);
  validateRequiredProperties(dataSource.properties);
  return { ...dataSource, createdDatabase: true };
}

async function retrieveDataSource(
  apiKey: string,
  dataSourceId: string,
  databaseFallback: unknown,
  databaseId: string,
): Promise<NotionDataSourceInfo> {
  try {
    const dataSource = await notionFetch<unknown>(apiKey, `/data_sources/${encodeURIComponent(dataSourceId)}`, { method: "GET" });
    return {
      id: extractString(dataSource, "id") || dataSourceId,
      databaseId,
      properties: extractProperties(dataSource),
    };
  } catch (error) {
    const fallbackProperties = extractProperties(databaseFallback);

    if (Object.keys(fallbackProperties).length > 0) {
      return { id: dataSourceId, databaseId, properties: fallbackProperties };
    }

    throw error;
  }
}

async function initializeDataSourceProperties(apiKey: string, dataSource: NotionDataSourceInfo): Promise<NotionDataSourceInfo> {
  const issues = getRequiredPropertyIssues(dataSource.properties);

  if (issues.incompatible.length > 0) {
    throw new Error(`Notion database has incompatible properties: ${issues.incompatible.join(", ")}.`);
  }

  if (issues.missing.length === 0) {
    return dataSource;
  }

  const patchProperties = createMissingPropertiesPatch(dataSource.properties);
  const updated = await notionFetch<unknown>(apiKey, `/data_sources/${encodeURIComponent(dataSource.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: patchProperties }),
  });
  const updatedDataSource = {
    ...dataSource,
    id: extractString(updated, "id") || dataSource.id,
    properties: {
      ...dataSource.properties,
      ...extractProperties(updated),
    },
    initializedSchema: true,
  };

  validateRequiredProperties(updatedDataSource.properties);
  return updatedDataSource;
}

async function isPageEmpty(apiKey: string, pageId: string): Promise<boolean> {
  const children = await notionFetch<unknown>(apiKey, `/blocks/${encodeURIComponent(pageId)}/children?page_size=1`, { method: "GET" });

  if (!isRecord(children) || !Array.isArray(children.results)) {
    return false;
  }

  return children.results.length === 0;
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
  const issues = getRequiredPropertyIssues(properties);
  const errors = [
    issues.missing.length > 0 ? `missing required properties: ${issues.missing.join(", ")}` : "",
    issues.incompatible.length > 0 ? `incompatible properties: ${issues.incompatible.join(", ")}` : "",
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(`Notion database is not ready: ${errors.join("; ")}.`);
  }
}

function getRequiredPropertyIssues(properties: Record<string, { type?: string }>): { missing: string[]; incompatible: string[] } {
  const missing: string[] = [];
  const incompatible: string[] = [];

  for (const [name, expectedType] of Object.entries(REQUIRED_PROPERTIES) as Array<[RequiredPropertyName, NotionPropertyType]>) {
    const actualType = properties[name]?.type;

    if (!actualType) {
      missing.push(`${name} (${expectedType})`);
      continue;
    }

    if (actualType !== expectedType) {
      incompatible.push(`${name} must be ${expectedType}, currently ${actualType}`);
    }
  }

  return { missing, incompatible };
}

function createMissingPropertiesPatch(properties: Record<string, { type?: string }>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const [name] of Object.entries(REQUIRED_PROPERTIES) as Array<[RequiredPropertyName, NotionPropertyType]>) {
    if (!properties[name]?.type) {
      patch[name] = createRequiredPropertySchema(name);
    }
  }

  return patch;
}

function createRequiredPropertiesSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const [name] of Object.entries(REQUIRED_PROPERTIES) as Array<[RequiredPropertyName, NotionPropertyType]>) {
    properties[name] = createRequiredPropertySchema(name);
  }

  return properties;
}

function createRequiredPropertySchema(name: RequiredPropertyName): Record<string, unknown> {
  const type = REQUIRED_PROPERTIES[name];

  switch (type) {
    case "title":
      return { title: {} };
    case "rich_text":
      return { rich_text: {} };
    case "url":
      return { url: {} };
    case "date":
      return { date: {} };
    case "select":
      return name === "AI"
        ? { select: { options: [{ name: "ChatGPT", color: "blue" }] } }
        : {
            select: {
              options: [
                { name: "manual", color: "green" },
                { name: "auto", color: "blue" },
              ],
            },
          };
  }
}

function describeTargetSetup(target: NotionDataSourceInfo): string {
  if (target.createdDatabase) {
    return "Created a Chat2Notion database in the provided empty page.";
  }

  if (target.initializedSchema) {
    return "Initialized the Notion database schema.";
  }

  return "Notion target is ready.";
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
    throw new NotionApiError(response.status, await readNotionError(response));
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

function toNotionText(content: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content } }];
}

function createPageMarkdownBackup(payload: ChatPairPayload): string {
  const question = normalizeMarkdownBackup(payload.questionMarkdown || payload.question);
  const answer = normalizeMarkdownBackup(payload.answerMarkdown || payload.answer);
  const sourceUrl = escapeMarkdownUrl(payload.sourceUrl);

  return [
    "# ChatGPT Sync Backup",
    `Source: [${sourceUrl}](${sourceUrl})`,
    `Synced At: ${new Date().toISOString()}`,
    `Sync Mode: ${payload.syncMode}`,
    `Message ID: ${payload.messageId}`,
    "## Question",
    question,
    "## Answer",
    answer,
  ].join("\n\n");
}

function normalizeMarkdownBackup(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeMarkdownUrl(value: string): string {
  return value.replace(/\)/g, "%29");
}

function assertNotionRequestFits(bodyJson: string): void {
  const size = new TextEncoder().encode(bodyJson).length;

  if (size > NOTION_REQUEST_BODY_LIMIT_BYTES) {
    throw new Error(
      `Notion request is too large after adding the page content backup (${Math.ceil(size / 1024)}KB, limit 489KB). Shorten the question or answer before syncing.`,
    );
  }
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

function isNotionApiError(error: unknown, status: number): error is NotionApiError {
  return error instanceof NotionApiError && error.status === status;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Chat2Notion error.";
}
