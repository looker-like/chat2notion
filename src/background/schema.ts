// Notion database schema creation and property validation.
// Ensures the target database has all 8 required properties with correct types,
// and keeps the AI select options in sync with supported platforms.

import { isRecord } from "../shared/config";
import { extractString } from "./common";
import {
  type NotionDataSourceInfo,
  type RequiredPropertyName,
  type NotionPropertyType,
  REQUIRED_PROPERTIES,
} from "./types";

// All AI platform names that can appear in the Notion AI select field.
// Colors match the branding used by each platform in the UI.
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

// Extract the data source ID from a Notion database response.
// Notion returns data sources either directly or nested in a results array.
export function extractDataSourceId(database: unknown): string {
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

// Extract property names and types from a Notion data source response.
// Also collects select option names for select-type properties.
export function extractProperties(value: unknown): Record<string, { type?: string; selectOptions?: string[] }> {
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

// Validate that all required properties exist with the expected types.
export function validateRequiredProperties(properties: Record<string, { type?: string }>): void {
  const issues = getRequiredPropertyIssues(properties);
  const errors = [
    issues.missing.length > 0 ? `missing required properties: ${issues.missing.join(", ")}` : "",
    issues.incompatible.length > 0 ? `incompatible properties: ${issues.incompatible.join(", ")}` : "",
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(`Notion database is not ready: ${errors.join("; ")}.`);
  }
}

// Split required properties into missing and incompatible categories.
export function getRequiredPropertyIssues(properties: Record<string, { type?: string }>): {
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

// Build a PATCH body that adds only the missing required properties.
export function createMissingPropertiesPatch(properties: Record<string, { type?: string }>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const [name] of Object.entries(REQUIRED_PROPERTIES) as Array<[RequiredPropertyName, NotionPropertyType]>) {
    if (!properties[name]?.type) {
      patch[name] = createRequiredPropertySchema(name);
    }
  }

  return patch;
}

// Build the full schema for all 8 required properties (used when creating a new database).
export function createRequiredPropertiesSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const [name] of Object.entries(REQUIRED_PROPERTIES) as Array<[RequiredPropertyName, NotionPropertyType]>) {
    properties[name] = createRequiredPropertySchema(name);
  }

  return properties;
}

// Build the schema definition for a single required property.
// The AI property gets a select with all supported platform options;
// Sync Mode gets manual/auto options; others get empty property shells.
export function createRequiredPropertySchema(name: RequiredPropertyName): Record<string, unknown> {
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

// Find which supported AI platform options are missing from the AI select property.
export function getMissingAiSelectOptions(properties: Record<string, { type?: string; selectOptions?: string[] }>): string[] {
  const aiProperty = properties.AI;

  if (aiProperty?.type !== "select") {
    return [];
  }

  const existingOptions = new Set(aiProperty.selectOptions ?? []);
  return SUPPORTED_AI_OPTIONS.map((option) => option.name).filter((name) => !existingOptions.has(name));
}

// Build the AI select property schema, merging known options with any existing user-defined ones.
export function createAiSelectPropertySchema(existingOptionNames: string[] = []): Record<string, unknown> {
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

// Human-readable description of what happened during target setup.
export function describeTargetSetup(target: NotionDataSourceInfo): string {
  if (target.createdDatabase) {
    return "Created a Chat2Notion database in the provided empty page.";
  }

  if (target.initializedSchema) {
    return "Initialized the Notion database schema.";
  }

  return "Notion target is ready.";
}
