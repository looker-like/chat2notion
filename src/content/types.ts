// DOM types shared across content script modules.

// A paired question/answer extracted from the AI chat DOM.
export interface ChatPair {
  assistant: HTMLElement;
  aiName: string;
  platformId: string;
  question: string;
  questionMarkdown: string;
  answer: string;
  answerMarkdown: string;
  messageId: string;
  sourceUrl: string;
}

// Extracted text and Markdown from a single message node.
export interface MessageContent {
  text: string;
  markdown: string;
}

// Sync origin: manual button click or automatic conversation-based trigger.
export type SyncMode = "manual" | "auto";

// All possible responses from background runtime messages used in the content script.
export type RuntimeResponse =
  | { ok: true; config: { autoSyncEnabled: boolean } }
  | { ok: true; synced: boolean; notionPageId?: string }
  | { ok: true; message?: string; notionPageId?: string }
  | { ok: false; message: string };

// References to the injected control bar DOM nodes for a single assistant message.
export interface ControlNodes {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  openButton: HTMLButtonElement;
  autoButton: HTMLButtonElement;
  status: HTMLSpanElement;
}
