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

export interface MessageContent {
  text: string;
  markdown: string;
}

export type SyncMode = "manual" | "auto";

export type RuntimeResponse =
  | { ok: true; config: { autoSyncEnabled: boolean } }
  | { ok: true; synced: boolean; notionPageId?: string }
  | { ok: true; message?: string; notionPageId?: string }
  | { ok: false; message: string };

export interface ControlNodes {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  openButton: HTMLButtonElement;
  autoButton: HTMLButtonElement;
  status: HTMLSpanElement;
}
