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
import { createTitleFromQuestion, MAX_RICH_TEXT_CHUNKS, splitRichText } from "../shared/text";

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
const NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES = 420_000;
const PROPERTY_PREVIEW_CHARACTER_LIMIT = 12_000;
const MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES = 340_000;
const SUPPORTED_AI_OPTIONS = [
  { name: "ChatGPT", color: "blue" },
  { name: "Gemini", color: "purple" },
  { name: "DeepSeek", color: "green" },
  { name: "Claude", color: "orange" },
  { name: "Grok", color: "orange" },
  { name: "Perplexity", color: "blue" },
  { name: "Copilot", color: "blue" },
  { name: "Poe", color: "purple" },
  { name: "Mistral", color: "red" },
  { name: "Meta AI", color: "blue" },
  { name: "Doubao", color: "red" },
  { name: "Kimi", color: "green" },
  { name: "Qwen", color: "purple" },
  { name: "Yuanbao", color: "orange" },
  { name: "ChatGLM", color: "green" },
  { name: "ERNIE", color: "blue" },
  { name: "HuggingChat", color: "yellow" },
  { name: "Duck.ai", color: "green" },
  { name: "You.com", color: "blue" },
  { name: "AI", color: "gray" },
] as const;

type RequiredPropertyName = keyof typeof REQUIRED_PROPERTIES;
type NotionPropertyType = (typeof REQUIRED_PROPERTIES)[RequiredPropertyName];

interface NotionDataSourceInfo {
  id: string;
  databaseId: string;
  properties: Record<string, { type?: string; selectOptions?: string[] }>;
  createdDatabase?: boolean;
  initializedSchema?: boolean;
}

interface NotionPageResponse {
  id?: string;
}

interface SyncedMessageRecord {
  syncedAt: string;
  notionPageId: string;
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
    case "chat2notion:isSynced": {
      const syncedMessage = await getSyncedMessage(message.messageId);
      return { ok: true, synced: Boolean(syncedMessage), notionPageId: syncedMessage?.notionPageId };
    }
    case "chat2notion:syncPair":
      return syncPair(message.payload, Boolean(message.overwrite));
  }
}

async function saveUserConfig(
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

async function syncPair(payload: ChatPairPayload, overwrite: boolean): Promise<RuntimeResponse> {
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

async function createNotionPage(
  apiKey: string,
  dataSourceId: string,
  payload: ChatPairPayload,
): Promise<NotionPageResponse> {
  const bodyJson = withPageParent(createPageRequestBodyJson(payload), dataSourceId);

  assertNotionRequestFits(bodyJson, "Notion page property request");

  const page = await notionFetch<NotionPageResponse>(apiKey, "/pages", {
    method: "POST",
    body: bodyJson,
  });

  if (!page.id) {
    throw new Error("Notion created a page but did not return its ID.");
  }

  await appendPageMarkdownBackup(apiKey, page.id, createPageMarkdownBackup(payload));
  return page;
}

async function updateNotionPage(apiKey: string, pageId: string, payload: ChatPairPayload): Promise<NotionPageResponse> {
  const bodyJson = createPagePropertiesBodyJson(payload);

  assertNotionRequestFits(bodyJson, "Notion page property update request");

  const page = await notionFetch<NotionPageResponse>(apiKey, `/pages/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    body: bodyJson,
  });

  await replacePageMarkdownBackup(apiKey, page.id ?? pageId, createPageMarkdownBackup(payload));
  return { ...page, id: page.id ?? pageId };
}

async function resolveSyncedPageId(
  apiKey: string,
  dataSourceId: string,
  messageId: string,
  storedPageId: string,
): Promise<string> {
  if (storedPageId && (await canAccessPage(apiKey, storedPageId))) {
    return storedPageId;
  }

  return findSyncedPageIdByMessageId(apiKey, dataSourceId, messageId);
}

async function canAccessPage(apiKey: string, pageId: string): Promise<boolean> {
  try {
    await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}`, { method: "GET" });
    return true;
  } catch (error) {
    if (isNotionApiError(error, 404)) {
      return false;
    }

    throw error;
  }
}

async function findSyncedPageIdByMessageId(apiKey: string, dataSourceId: string, messageId: string): Promise<string> {
  const response = await notionFetch<unknown>(apiKey, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: "Message ID",
        rich_text: {
          equals: messageId,
        },
      },
    }),
  });

  if (!isRecord(response) || !Array.isArray(response.results)) {
    return "";
  }

  const firstPage = response.results.find(isRecord);
  return firstPage ? extractString(firstPage, "id") : "";
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
          { cause: pageError },
        );
      }

      throw pageError;
    }
  }
}

async function ensureDatabaseTarget(apiKey: string, databaseId: string): Promise<NotionDataSourceInfo> {
  const database = await notionFetch<unknown>(apiKey, `/databases/${encodeURIComponent(databaseId)}`, {
    method: "GET",
  });
  const resolvedDatabaseId = extractString(database, "id") || databaseId;
  const dataSourceId = extractDataSourceId(database) || databaseId;
  const dataSource = await retrieveDataSource(apiKey, dataSourceId, database, resolvedDatabaseId);
  return initializeDataSourceProperties(apiKey, dataSource);
}

async function createDatabaseInEmptyPage(apiKey: string, pageId: string): Promise<NotionDataSourceInfo> {
  await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}`, { method: "GET" });

  if (!(await isPageEmpty(apiKey, pageId))) {
    throw new Error(
      "Provided ID is a Notion page, but it is not empty. Use an empty page ID or an existing database ID.",
    );
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

  const refreshedDatabase = await notionFetch<unknown>(apiKey, `/databases/${encodeURIComponent(createdDatabaseId)}`, {
    method: "GET",
  });
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
    const dataSource = await notionFetch<unknown>(apiKey, `/data_sources/${encodeURIComponent(dataSourceId)}`, {
      method: "GET",
    });
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

async function initializeDataSourceProperties(
  apiKey: string,
  dataSource: NotionDataSourceInfo,
): Promise<NotionDataSourceInfo> {
  const issues = getRequiredPropertyIssues(dataSource.properties);
  const missingAiOptions = getMissingAiSelectOptions(dataSource.properties);

  if (issues.incompatible.length > 0) {
    throw new Error(`Notion database has incompatible properties: ${issues.incompatible.join(", ")}.`);
  }

  if (issues.missing.length === 0 && missingAiOptions.length === 0) {
    return dataSource;
  }

  const patchProperties = createMissingPropertiesPatch(dataSource.properties);

  if (!issues.missing.some((item) => item.startsWith("AI ")) && missingAiOptions.length > 0) {
    patchProperties.AI = createAiSelectPropertySchema(dataSource.properties.AI?.selectOptions ?? []);
  }

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
  const children = await notionFetch<unknown>(apiKey, `/blocks/${encodeURIComponent(pageId)}/children?page_size=1`, {
    method: "GET",
  });

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

  const results =
    isRecord(database.data_sources) && Array.isArray(database.data_sources.results)
      ? database.data_sources.results
      : Array.isArray(database.results)
        ? database.results
        : [];
  const firstResult = results.find(isRecord);

  return firstResult ? extractString(firstResult, "id") : "";
}

function extractProperties(value: unknown): Record<string, { type?: string; selectOptions?: string[] }> {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return {};
  }

  const properties: Record<string, { type?: string; selectOptions?: string[] }> = {};

  Object.entries(value.properties).forEach(([name, property]) => {
    if (isRecord(property)) {
      const type = typeof property.type === "string" ? property.type : undefined;
      const select = isRecord(property.select) ? property.select : null;
      const selectOptions =
        select && Array.isArray(select.options)
          ? select.options.flatMap((option) =>
              isRecord(option) && typeof option.name === "string" ? [option.name] : [],
            )
          : undefined;
      properties[name] = { type, selectOptions };
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

function getRequiredPropertyIssues(properties: Record<string, { type?: string }>): {
  missing: string[];
  incompatible: string[];
} {
  const missing: string[] = [];
  const incompatible: string[] = [];

  for (const [name, expectedType] of Object.entries(REQUIRED_PROPERTIES) as Array<
    [RequiredPropertyName, NotionPropertyType]
  >) {
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
        ? createAiSelectPropertySchema()
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

function getMissingAiSelectOptions(properties: Record<string, { type?: string; selectOptions?: string[] }>): string[] {
  const aiProperty = properties.AI;

  if (aiProperty?.type !== "select") {
    return [];
  }

  const existingOptions = new Set(aiProperty.selectOptions ?? []);
  return SUPPORTED_AI_OPTIONS.map((option) => option.name).filter((name) => !existingOptions.has(name));
}

function createAiSelectPropertySchema(existingOptionNames: string[] = []): Record<string, unknown> {
  const knownOptions = new Map<string, { name: string; color: string }>(
    SUPPORTED_AI_OPTIONS.map((option) => [option.name, { ...option }]),
  );

  existingOptionNames.forEach((name) => {
    if (!knownOptions.has(name)) {
      knownOptions.set(name, { name, color: "default" });
    }
  });

  return { select: { options: Array.from(knownOptions.values()).map((option) => ({ ...option })) } };
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

function createPageRequestBodyJson(payload: ChatPairPayload): string {
  const fullBodyJson = JSON.stringify(createPageRequestBody(payload, false));

  if (
    getByteLength(fullBodyJson) <= NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES &&
    canUseFullPropertyValue(payload.question) &&
    canUseFullPropertyValue(payload.answer)
  ) {
    return fullBodyJson;
  }

  return JSON.stringify(createPageRequestBody(payload, true));
}

function createPagePropertiesBodyJson(payload: ChatPairPayload): string {
  const fullBodyJson = JSON.stringify({ properties: createPageProperties(payload, false) });

  if (
    getByteLength(fullBodyJson) <= NOTION_SAFE_REQUEST_BODY_LIMIT_BYTES &&
    canUseFullPropertyValue(payload.question) &&
    canUseFullPropertyValue(payload.answer)
  ) {
    return fullBodyJson;
  }

  return JSON.stringify({ properties: createPageProperties(payload, true) });
}

function createPageRequestBody(payload: ChatPairPayload, usePropertyPreview: boolean): Record<string, unknown> {
  return {
    parent: { data_source_id: "" },
    properties: createPageProperties(payload, usePropertyPreview),
  };
}

function createPageProperties(payload: ChatPairPayload, usePropertyPreview: boolean): Record<string, unknown> {
  return {
    Name: {
      title: [{ type: "text", text: { content: createTitleFromQuestion(payload.question) } }],
    },
    Question: { rich_text: toRichText(toPropertyValue(payload.question, usePropertyPreview)) },
    Answer: { rich_text: toRichText(toPropertyValue(payload.answer, usePropertyPreview)) },
    AI: { select: { name: payload.aiName || "ChatGPT" } },
    "Source URL": { url: payload.sourceUrl },
    "Synced At": { date: { start: new Date().toISOString() } },
    "Message ID": { rich_text: toRichText(payload.messageId) },
    "Sync Mode": { select: { name: payload.syncMode } },
  };
}

function withPageParent(bodyJson: string, dataSourceId: string): string {
  const body = JSON.parse(bodyJson) as { parent?: unknown };
  body.parent = { data_source_id: dataSourceId };
  return JSON.stringify(body);
}

async function appendPageMarkdownBackup(apiKey: string, pageId: string, markdown: string): Promise<void> {
  const chunks = splitMarkdownForNotion(markdown);

  for (const chunk of chunks) {
    const bodyJson = JSON.stringify({
      type: "insert_content",
      insert_content: {
        content: chunk,
      },
    });

    assertNotionRequestFits(bodyJson, "Notion markdown backup chunk");

    await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}/markdown`, {
      method: "PATCH",
      body: bodyJson,
    });
  }
}

async function replacePageMarkdownBackup(apiKey: string, pageId: string, markdown: string): Promise<void> {
  const [firstChunk = "No content captured.", ...remainingChunks] = splitMarkdownForNotion(markdown);
  const bodyJson = JSON.stringify({
    type: "replace_content",
    replace_content: {
      new_str: firstChunk,
    },
  });

  assertNotionRequestFits(bodyJson, "Notion markdown replacement chunk");

  await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}/markdown`, {
    method: "PATCH",
    body: bodyJson,
  });

  for (const chunk of remainingChunks) {
    const appendBodyJson = JSON.stringify({
      type: "insert_content",
      insert_content: {
        content: chunk,
      },
    });

    assertNotionRequestFits(appendBodyJson, "Notion markdown backup chunk");

    await notionFetch<unknown>(apiKey, `/pages/${encodeURIComponent(pageId)}/markdown`, {
      method: "PATCH",
      body: appendBodyJson,
    });
  }
}

function createPageMarkdownBackup(payload: ChatPairPayload): string {
  const question = normalizeMarkdownBackup(payload.questionMarkdown || payload.question);
  const answer = normalizeMarkdownBackup(payload.answerMarkdown || payload.answer);
  const sourceUrl = escapeMarkdownUrl(payload.sourceUrl);

  return [
    "# AI Sync Backup",
    `AI: ${payload.aiName || "ChatGPT"}`,
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

function canUseFullPropertyValue(value: string): boolean {
  return splitRichText(value).length <= MAX_RICH_TEXT_CHUNKS;
}

function toPropertyValue(value: string, usePreview: boolean): string {
  if (!usePreview && canUseFullPropertyValue(value)) {
    return value;
  }

  const preview = value.slice(0, PROPERTY_PREVIEW_CHARACTER_LIMIT).trimEnd();
  const suffix = value.length > preview.length ? "\n\n[Full content is saved in the Notion page body.]" : "";
  return `${preview}${suffix}`;
}

function splitMarkdownForNotion(markdown: string): string[] {
  const units = splitMarkdownUnits(markdown);
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (getByteLength(unit) > MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES) {
      flushMarkdownChunk(chunks, current);
      current = "";
      chunks.push(...splitTextByByteLimit(unit, MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES));
      continue;
    }

    const candidate = current ? `${current}\n\n${unit}` : unit;

    if (getByteLength(candidate) > MARKDOWN_CHUNK_CONTENT_LIMIT_BYTES) {
      flushMarkdownChunk(chunks, current);
      current = unit;
    } else {
      current = candidate;
    }
  }

  flushMarkdownChunk(chunks, current);
  return chunks.length > 0 ? chunks : ["No content captured."];
}

function splitMarkdownUnits(markdown: string): string[] {
  const units: string[] = [];
  const lines = normalizeMarkdownBackup(markdown).split("\n");
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
    }

    if (!inFence && !line.trim()) {
      flushMarkdownUnit(units, current);
      current = [];
      continue;
    }

    current.push(line);
  }

  flushMarkdownUnit(units, current);
  return units;
}

function splitTextByByteLimit(value: string, byteLimit: number): string[] {
  const chunks: string[] = [];
  const encoder = new TextEncoder();
  let current = "";
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).length;

    if (current && currentBytes + characterBytes > byteLimit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }

    current += character;
    currentBytes += characterBytes;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function flushMarkdownUnit(units: string[], lines: string[]): void {
  const unit = lines.join("\n").trim();

  if (unit) {
    units.push(unit);
  }
}

function flushMarkdownChunk(chunks: string[], chunk: string): void {
  const normalized = chunk.trim();

  if (normalized) {
    chunks.push(normalized);
  }
}

function assertNotionRequestFits(bodyJson: string, label: string): void {
  const size = getByteLength(bodyJson);

  if (size > NOTION_REQUEST_BODY_LIMIT_BYTES) {
    throw new Error(
      `${label} is too large (${Math.ceil(size / 1024)}KB, limit 489KB). Chat2Notion could not safely split this request.`,
    );
  }
}

function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
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

async function getSyncedMessages(): Promise<Record<string, SyncedMessageRecord>> {
  const stored = await chrome.storage.local.get(SYNCED_MESSAGES_STORAGE_KEY);
  return readSyncedMessages(stored[SYNCED_MESSAGES_STORAGE_KEY]);
}

async function getSyncedMessage(messageId: string): Promise<SyncedMessageRecord | null> {
  const messages = await getSyncedMessages();
  return messages[messageId] ?? null;
}

async function markMessageSynced(messageId: string, notionPageId: string): Promise<void> {
  const messages = await getSyncedMessages();
  messages[messageId] = {
    syncedAt: new Date().toISOString(),
    notionPageId,
  };
  await chrome.storage.local.set({ [SYNCED_MESSAGES_STORAGE_KEY]: messages });
}

function readSyncedMessages(value: unknown): Record<string, SyncedMessageRecord> {
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

function normalizeNotionId(value: string): string {
  const trimmed = value.trim();
  const uuidMatch = trimmed.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return (uuidMatch?.[0] ?? trimmed).replace(/-/g, "");
}

function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  return isRecord(value) && typeof value.type === "string" && value.type.startsWith("chat2notion:");
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
