import { isRecord } from "../shared/config";
import type { NotionDataSourceInfo } from "./types";
import { extractString, isNotionApiError, toErrorMessage } from "./common";
import { notionFetch } from "./notion-client";
import {
  createAiSelectPropertySchema,
  createMissingPropertiesPatch,
  createRequiredPropertiesSchema,
  describeTargetSetup,
  extractDataSourceId,
  extractProperties,
  getMissingAiSelectOptions,
  getRequiredPropertyIssues,
  validateRequiredProperties,
} from "./schema";
import { toNotionText } from "./page-properties";

const DEFAULT_DATABASE_TITLE = "Chat2Notion";
const DEFAULT_DATA_SOURCE_TITLE = "Synced Chats";

export async function ensureChat2NotionTarget(apiKey: string, databaseId: string): Promise<NotionDataSourceInfo> {
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

export async function ensureDatabaseTarget(apiKey: string, databaseId: string): Promise<NotionDataSourceInfo> {
  const database = await notionFetch<unknown>(apiKey, `/databases/${encodeURIComponent(databaseId)}`, {
    method: "GET",
  });
  const resolvedDatabaseId = extractString(database, "id") || databaseId;
  const dataSourceId = extractDataSourceId(database) || databaseId;
  const dataSource = await retrieveDataSource(apiKey, dataSourceId, database, resolvedDatabaseId);
  return initializeDataSourceProperties(apiKey, dataSource);
}

export async function createDatabaseInEmptyPage(apiKey: string, pageId: string): Promise<NotionDataSourceInfo> {
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

export async function retrieveDataSource(
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

export async function initializeDataSourceProperties(
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

export async function isPageEmpty(apiKey: string, pageId: string): Promise<boolean> {
  const children = await notionFetch<unknown>(apiKey, `/blocks/${encodeURIComponent(pageId)}/children?page_size=1`, {
    method: "GET",
  });

  if (!isRecord(children) || !Array.isArray(children.results)) {
    return false;
  }

  return children.results.length === 0;
}

export { describeTargetSetup };
