// Message-passing and formatting helpers for the extension popup.
// Wraps chrome.runtime.sendMessage and normalizes response/error handling.

import type { RuntimeResponse } from "./popup-types";

// Send a message to the background worker and return the typed response.
export async function sendMessage(message: object): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}

// Extract the human-readable message from a runtime response,
// falling back to the provided default when the response is successful but message-less.
export function getResponseMessage(response: RuntimeResponse, fallback: string): string {
  return "message" in response && typeof response.message === "string" ? response.message : fallback;
}

// Format an ISO timestamp for display in the popup.
// Uses Chinese locale with 24-hour format.
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

// Normalize any thrown value into a human-readable error string.
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected popup error.";
}
