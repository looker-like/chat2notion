// Shared error and utility helpers for the background worker.
// Kept separate so background modules don't depend on heavier modules.

import { isRecord } from "../shared/config";

// Custom error type that carries the HTTP status code from Notion API failures.
export class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

// Safely extract a string property from an unknown Notion API response body.
export function extractString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}

// Type guard: is this error a NotionApiError with the expected status code?
export function isNotionApiError(error: unknown, status: number): error is NotionApiError {
  return error instanceof NotionApiError && error.status === status;
}

// Convert any thrown value into a human-readable error message.
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Chat2Notion error.";
}
