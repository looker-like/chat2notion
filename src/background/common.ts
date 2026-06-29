import { isRecord } from "../shared/config";

export class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

export function extractString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}
export function isNotionApiError(error: unknown, status: number): error is NotionApiError {
  return error instanceof NotionApiError && error.status === status;
}
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Chat2Notion error.";
}
