import { NOTION_VERSION, isRecord } from "../shared/config";
import { NotionApiError } from "./common";

const NOTION_API_BASE = "https://api.notion.com/v1";

export async function notionFetch<T>(apiKey: string, path: string, init: RequestInit, retry = true): Promise<T> {
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

export async function readNotionError(response: Response): Promise<string> {
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

export async function waitForRetryAfter(value: string | null): Promise<void> {
  const seconds = Number(value);
  const delayMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
}
