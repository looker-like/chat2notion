import { AUTO_SYNCED_ATTRIBUTE } from "./constants";
import { setControlState, setNotionPageId } from "./controls";
import { getResponseMessage, type RuntimeClient } from "./runtime";
import type { ChatPair, ControlNodes, SyncMode } from "./types";

export async function initializeSyncedState(
  messageId: string,
  control: ControlNodes,
  runtime: RuntimeClient,
): Promise<void> {
  const response = await runtime.sendMessage({ type: "chat2notion:isSynced", messageId });

  if (response.ok && "synced" in response && response.synced) {
    setNotionPageId(control, response.notionPageId ?? "");
    setControlState(control, "synced", "Synced");
  }
}

export async function handleManualSync(
  pair: ChatPair,
  control: ControlNodes,
  runtime: RuntimeClient,
): Promise<void> {
  if (control.root.dataset.state === "synced") {
    const confirmed = window.confirm("This answer is already synced. Resync and overwrite the existing Notion page?");

    if (!confirmed) {
      return;
    }

    await syncPair(pair, control, "manual", runtime, true);
    return;
  }

  await syncPair(pair, control, "manual", runtime);
}

export async function syncPair(
  pair: ChatPair,
  control: ControlNodes,
  syncMode: SyncMode,
  runtime: RuntimeClient,
  overwrite = false,
): Promise<void> {
  setControlState(
    control,
    "pending",
    overwrite ? "Resyncing..." : syncMode === "auto" ? "Auto-syncing..." : "Syncing...",
  );

  const response = await runtime.sendMessage({
    type: "chat2notion:syncPair",
    overwrite,
    payload: {
      messageId: pair.messageId,
      aiName: pair.aiName,
      question: pair.question,
      questionMarkdown: pair.questionMarkdown,
      answer: pair.answer,
      answerMarkdown: pair.answerMarkdown,
      sourceUrl: pair.sourceUrl,
      syncMode,
    },
  });

  if (response.ok) {
    pair.assistant.setAttribute(AUTO_SYNCED_ATTRIBUTE, pair.messageId);
    setNotionPageId(control, "notionPageId" in response ? (response.notionPageId ?? "") : "");
    setControlState(control, "synced", getResponseMessage(response, "Synced"));
    return;
  }

  setControlState(control, "error", response.message);
}