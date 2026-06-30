import { CONTROL_ATTRIBUTE } from "./constants";
import { buildChatPair, getAssistantMessages, getCurrentAdapter } from "./platform";

export interface PageDiagnostics {
  platformId: string;
  aiName: string;
  url: string;
  assistantCount: number;
  pairCount: number;
  controlCount: number;
  ready: boolean;
}

export function createPageDiagnostics(): PageDiagnostics {
  const adapter = getCurrentAdapter();
  const assistants = getAssistantMessages();
  const pairs = assistants.map((assistant) => buildChatPair(assistant)).filter((pair) => pair !== null);
  const controlCount = document.querySelectorAll(`[${CONTROL_ATTRIBUTE}]`).length;

  return {
    platformId: adapter.id,
    aiName: adapter.aiName,
    url: location.href,
    assistantCount: assistants.length,
    pairCount: pairs.length,
    controlCount,
    ready: pairs.length > 0 && controlCount >= pairs.length,
  };
}

export function isDiagnosticsRequest(value: unknown): value is { type: "chat2notion:diagnosePage" } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "chat2notion:diagnosePage"
  );
}
