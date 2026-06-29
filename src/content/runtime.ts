import type { RuntimeResponse } from "./types";

const EXTENSION_RELOADED_MESSAGE = "Extension was reloaded. Refresh this AI chat tab.";

export interface RuntimeClient {
  isValid(): boolean;
  sendMessage(message: object): Promise<RuntimeResponse>;
  safeStorageGet(key: string): Promise<Record<string, unknown>>;
  safeStorageSet(value: Record<string, unknown>): Promise<boolean>;
}

export function createRuntimeClient(onInvalidated: () => void): RuntimeClient {
  let extensionContextValid = true;

  function invalidate(): void {
    if (!extensionContextValid) {
      return;
    }

    extensionContextValid = false;
    onInvalidated();
  }

  return {
    isValid: () => extensionContextValid,
    async sendMessage(message: object): Promise<RuntimeResponse> {
      if (!extensionContextValid) {
        return { ok: false, message: EXTENSION_RELOADED_MESSAGE };
      }

      try {
        return (await chrome.runtime.sendMessage(message)) as RuntimeResponse;
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          invalidate();
          return { ok: false, message: EXTENSION_RELOADED_MESSAGE };
        }

        return { ok: false, message: toErrorMessage(error, "Could not contact Chat2Notion background worker.") };
      }
    },
    async safeStorageGet(key: string): Promise<Record<string, unknown>> {
      if (!extensionContextValid) {
        return {};
      }

      try {
        return (await chrome.storage.local.get(key)) as Record<string, unknown>;
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          invalidate();
        }

        return {};
      }
    },
    async safeStorageSet(value: Record<string, unknown>): Promise<boolean> {
      if (!extensionContextValid) {
        return false;
      }

      try {
        await chrome.storage.local.set(value);
        return true;
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          invalidate();
        }

        return false;
      }
    },
  };
}

export function getResponseMessage(response: RuntimeResponse, fallback: string): string {
  return "message" in response && typeof response.message === "string" ? response.message : fallback;
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return toErrorMessage(error, "").includes("Extension context invalidated");
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}