// Shared type definitions for the extension popup.
// Kept separate so renderer.ts and messenger.ts can import types
// without pulling in the full popup module.

export interface Chat2NotionConfig {
  apiKey: string;
  databaseId: string;
  dataSourceId: string;
  autoSyncEnabled: boolean;
  lastSyncStatus: { tone: "idle" | "success" | "error" | "pending"; message: string; at: string } | null;
}

export type RuntimeResponse =
  | { ok: true; config: Chat2NotionConfig }
  | { ok: true; message?: string }
  | { ok: false; message: string };

export interface PageDiagnostics {
  platformId: string;
  aiName: string;
  assistantCount: number;
  pairCount: number;
  controlCount: number;
  ready: boolean;
}
