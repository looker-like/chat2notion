import { CONVERSATION_AUTO_SYNC_STORAGE_KEY, type ChatPairPayload, type RuntimeResponse } from "../shared/config";

const CONTROL_CLASS = "c2n-control";
const CONTROL_ATTRIBUTE = "data-chat2notion-control";
const ASSISTANT_PROCESSED_ATTRIBUTE = "data-chat2notion-processed";
const AUTO_SYNCED_ATTRIBUTE = "data-chat2notion-auto-synced";
const OBSERVER_DEBOUNCE_MS = 700;
const AUTO_SYNC_STABILITY_MS = 2200;
const MIN_AUTO_SYNC_ANSWER_LENGTH = 2;

interface ChatPair {
  assistant: HTMLElement;
  question: string;
  answer: string;
  messageId: string;
  sourceUrl: string;
}

interface ControlNodes {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  autoButton: HTMLButtonElement;
  status: HTMLSpanElement;
}

let autoSyncEnabled = false;
let conversationAutoSyncEnabled = false;
let conversationKey = createConversationKey();
let scanTimer: number | null = null;
const autoSyncTimers = new Map<string, number>();

void initialize();

async function initialize(): Promise<void> {
  ensureStyles();
  await refreshConfig();
  await refreshConversationAutoSync();
  scanPage();
  observeChat();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.chat2notionConfig) {
      return;
    }

    void refreshConfig().then(() => scheduleScan(100));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[CONVERSATION_AUTO_SYNC_STORAGE_KEY]) {
      return;
    }

    void refreshConversationAutoSync().then(() => scheduleScan(100));
  });

  window.addEventListener("popstate", () => {
    void handleLocationChanged();
  });

  window.setInterval(() => {
    if (conversationKey !== createConversationKey()) {
      void handleLocationChanged();
    }
  }, 1000);
}

async function refreshConfig(): Promise<void> {
  const response = await sendMessage({ type: "chat2notion:getConfig" });

  if (response.ok && "config" in response) {
    autoSyncEnabled = response.config.autoSyncEnabled;
  }
}

async function refreshConversationAutoSync(): Promise<void> {
  const stored = await chrome.storage.local.get(CONVERSATION_AUTO_SYNC_STORAGE_KEY);
  const state = readConversationAutoSyncState(stored[CONVERSATION_AUTO_SYNC_STORAGE_KEY]);
  conversationAutoSyncEnabled = Boolean(state[conversationKey]);
}

async function handleLocationChanged(): Promise<void> {
  conversationKey = createConversationKey();
  await refreshConversationAutoSync();
  scheduleScan(100);
}

function observeChat(): void {
  const observer = new MutationObserver(() => scheduleScan(OBSERVER_DEBOUNCE_MS));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function scheduleScan(delay: number): void {
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
  }

  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scanPage();
  }, delay);
}

function scanPage(): void {
  getAssistantMessages().forEach((assistant) => {
    const pair = buildChatPair(assistant);

    if (!pair) {
      return;
    }

    ensureControl(pair);

    if (autoSyncEnabled || conversationAutoSyncEnabled) {
      scheduleAutoSync(pair);
    }
  });
}

function getAssistantMessages(): HTMLElement[] {
  const byRole = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]'));

  if (byRole.length > 0) {
    return byRole.filter((node) => !isInsideChat2NotionControl(node));
  }

  const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));
  return articles.filter((article) => {
    const text = article.textContent?.trim() ?? "";
    const ariaLabel = article.getAttribute("aria-label") ?? "";
    return text && /assistant|chatgpt/i.test(ariaLabel);
  });
}

function getUserMessages(): HTMLElement[] {
  const byRole = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role="user"]'));

  if (byRole.length > 0) {
    return byRole;
  }

  const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));
  return articles.filter((article) => /user|you/i.test(article.getAttribute("aria-label") ?? ""));
}

function buildChatPair(assistant: HTMLElement): ChatPair | null {
  const answer = extractMessageText(assistant);

  if (!answer) {
    return null;
  }

  const user = findPreviousUserMessage(assistant);
  const question = user ? extractMessageText(user) : "";

  if (!question) {
    return null;
  }

  const sourceUrl = location.href;
  const messageId = createMessageId(question, answer, sourceUrl);

  return {
    assistant,
    question,
    answer,
    messageId,
    sourceUrl,
  };
}

function findPreviousUserMessage(assistant: HTMLElement): HTMLElement | null {
  const users = getUserMessages();
  let previous: HTMLElement | null = null;

  for (const user of users) {
    const position = user.compareDocumentPosition(assistant);

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      previous = user;
      continue;
    }
  }

  return previous;
}

function extractMessageText(message: HTMLElement): string {
  const clone = message.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`[${CONTROL_ATTRIBUTE}], script, style, button, svg`).forEach((node) => node.remove());

  const markdown = clone.querySelector<HTMLElement>(".markdown, [data-message-content], [data-testid='conversation-turn-message']");
  const text = (markdown ?? clone).innerText || (markdown ?? clone).textContent || "";
  return normalizeText(text);
}

function ensureControl(pair: ChatPair): void {
  pair.assistant.setAttribute(ASSISTANT_PROCESSED_ATTRIBUTE, "true");

  const existing = pair.assistant.querySelector<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`);
  const control = existing ? readControl(existing) : createControl(pair);

  if (!existing) {
    const insertionTarget = findInsertionTarget(pair.assistant);
    insertionTarget.append(control.root);
  }

  control.root.dataset.messageId = pair.messageId;
  control.button.onclick = () => {
    void syncPair(pair, control, "manual");
  };
  control.autoButton.onclick = () => {
    void toggleConversationAutoSync(pair, control);
  };
  syncConversationAutoButton(control);

  void initializeSyncedState(pair.messageId, control);
}

function createControl(pair: ChatPair): ControlNodes {
  const root = document.createElement("div");
  root.className = CONTROL_CLASS;
  root.setAttribute(CONTROL_ATTRIBUTE, "true");
  root.dataset.messageId = pair.messageId;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Sync to Notion";

  const autoButton = document.createElement("button");
  autoButton.type = "button";
  autoButton.dataset.role = "conversation-auto-sync";

  const status = document.createElement("span");
  status.textContent = "";

  root.append(button, autoButton, status);
  return { root, button, autoButton, status };
}

function readControl(root: HTMLDivElement): ControlNodes {
  const button = root.querySelector<HTMLButtonElement>("button:not([data-role='conversation-auto-sync'])") ?? document.createElement("button");
  const autoButton =
    root.querySelector<HTMLButtonElement>("button[data-role='conversation-auto-sync']") ?? document.createElement("button");
  const status = root.querySelector<HTMLSpanElement>("span") ?? document.createElement("span");

  if (!button.parentElement) {
    button.type = "button";
    button.textContent = "Sync to Notion";
    root.append(button);
  }

  if (!autoButton.parentElement) {
    autoButton.type = "button";
    autoButton.dataset.role = "conversation-auto-sync";
    root.append(autoButton);
  }

  if (!status.parentElement) {
    root.append(status);
  }

  return { root, button, autoButton, status };
}

function findInsertionTarget(assistant: HTMLElement): HTMLElement {
  const article = assistant.closest<HTMLElement>("article");
  return article ?? assistant;
}

async function initializeSyncedState(messageId: string, control: ControlNodes): Promise<void> {
  const response = await sendMessage({ type: "chat2notion:isSynced", messageId });

  if (response.ok && "synced" in response && response.synced) {
    setControlState(control, "synced", "Synced");
  }
}

async function toggleConversationAutoSync(pair: ChatPair, control: ControlNodes): Promise<void> {
  const nextEnabled = !conversationAutoSyncEnabled;
  await setConversationAutoSync(nextEnabled);
  conversationAutoSyncEnabled = nextEnabled;
  syncAllConversationAutoButtons();

  if (!nextEnabled) {
    setControlStatus(control, "Conversation auto-save off.");
    return;
  }

  setControlStatus(control, "Conversation auto-save on. Future answers will sync.");

  if (control.root.dataset.state !== "synced") {
    await syncPair(pair, control, "auto");
  }

  scheduleScan(100);
}

async function setConversationAutoSync(enabled: boolean): Promise<void> {
  const stored = await chrome.storage.local.get(CONVERSATION_AUTO_SYNC_STORAGE_KEY);
  const state = readConversationAutoSyncState(stored[CONVERSATION_AUTO_SYNC_STORAGE_KEY]);

  if (enabled) {
    state[conversationKey] = {
      enabled: true,
      sourceUrl: location.href,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete state[conversationKey];
  }

  await chrome.storage.local.set({ [CONVERSATION_AUTO_SYNC_STORAGE_KEY]: state });
}

function syncAllConversationAutoButtons(): void {
  document.querySelectorAll<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`).forEach((root) => {
    syncConversationAutoButton(readControl(root));
  });
}

function syncConversationAutoButton(control: ControlNodes): void {
  control.autoButton.textContent = conversationAutoSyncEnabled ? "Auto-save chat: On" : "Auto-save chat";
  control.autoButton.dataset.enabled = conversationAutoSyncEnabled ? "true" : "false";
  control.autoButton.title = conversationAutoSyncEnabled
    ? "Disable automatic Notion sync for this ChatGPT conversation."
    : "Enable automatic Notion sync for this ChatGPT conversation.";
}

function scheduleAutoSync(pair: ChatPair): void {
  if (pair.assistant.getAttribute(AUTO_SYNCED_ATTRIBUTE) === pair.messageId) {
    return;
  }

  if (pair.answer.length < MIN_AUTO_SYNC_ANSWER_LENGTH || isAnswerStillStreaming(pair.assistant)) {
    scheduleScan(AUTO_SYNC_STABILITY_MS);
    return;
  }

  const previousTimer = autoSyncTimers.get(pair.messageId);

  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer);
  }

  const timer = window.setTimeout(() => {
    autoSyncTimers.delete(pair.messageId);
    const latestPair = buildChatPair(pair.assistant);

    if (!latestPair || latestPair.messageId !== pair.messageId || isAnswerStillStreaming(pair.assistant)) {
      scheduleScan(AUTO_SYNC_STABILITY_MS);
      return;
    }

    const controlRoot = pair.assistant.querySelector<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`);

    if (!controlRoot) {
      return;
    }

    void syncPair(latestPair, readControl(controlRoot), "auto");
  }, AUTO_SYNC_STABILITY_MS);

  autoSyncTimers.set(pair.messageId, timer);
}

async function syncPair(pair: ChatPair, control: ControlNodes, syncMode: ChatPairPayload["syncMode"]): Promise<void> {
  setControlState(control, "pending", syncMode === "auto" ? "Auto-syncing..." : "Syncing...");

  const response = await sendMessage({
    type: "chat2notion:syncPair",
    payload: {
      messageId: pair.messageId,
      question: pair.question,
      answer: pair.answer,
      sourceUrl: pair.sourceUrl,
      syncMode,
    },
  });

  if (response.ok) {
    pair.assistant.setAttribute(AUTO_SYNCED_ATTRIBUTE, pair.messageId);
    setControlState(control, "synced", getResponseMessage(response, "Synced"));
    return;
  }

  setControlState(control, "error", response.message);
}

function setControlState(control: ControlNodes, state: "idle" | "pending" | "synced" | "error", message: string): void {
  control.root.dataset.state = state;
  control.status.textContent = message;
  control.button.disabled = state === "pending" || state === "synced";
  control.button.textContent = state === "synced" ? "Synced" : state === "pending" ? "Syncing" : "Sync to Notion";
  control.autoButton.disabled = state === "pending";
}

function setControlStatus(control: ControlNodes, message: string): void {
  control.status.textContent = message;
}

function isAnswerStillStreaming(assistant: HTMLElement): boolean {
  return Boolean(
    assistant.querySelector('[data-testid="stop-button"], [aria-label*="Stop"], [aria-label*="停止"], .result-streaming'),
  );
}

async function sendMessage(message: object): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}

function getResponseMessage(response: RuntimeResponse, fallback: string): string {
  return "message" in response && typeof response.message === "string" ? response.message : fallback;
}

function createMessageId(question: string, answer: string, sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const seed = `${url.origin}${url.pathname}|${normalizeText(question)}|${normalizeText(answer).slice(0, 600)}|${answer.length}`;
  return `chatgpt-${hashString(seed)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function createConversationKey(): string {
  const url = new URL(location.href);
  return `${url.origin}${url.pathname.replace(/\/$/, "") || "/new-chat"}`;
}

function readConversationAutoSyncState(value: unknown): Record<string, { enabled: true; sourceUrl: string; updatedAt: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, { enabled: true; sourceUrl: string; updatedAt: string }] => {
      const item = entry[1];
      return (
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item) &&
        (item as { enabled?: unknown }).enabled === true &&
        typeof (item as { sourceUrl?: unknown }).sourceUrl === "string" &&
        typeof (item as { updatedAt?: unknown }).updatedAt === "string"
      );
    }),
  );
}

function isInsideChat2NotionControl(node: HTMLElement): boolean {
  return Boolean(node.closest(`[${CONTROL_ATTRIBUTE}]`));
}

function ensureStyles(): void {
  if (document.getElementById("chat2notion-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "chat2notion-style";
  style.textContent = `
.${CONTROL_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 2px;
  font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.${CONTROL_CLASS} button {
  border: 1px solid #c8d1e1;
  border-radius: 999px;
  padding: 5px 10px;
  color: #18314f;
  background: #f8fbff;
  cursor: pointer;
}
.${CONTROL_CLASS} button:hover:not(:disabled) {
  border-color: #5179bd;
  background: #eef5ff;
}
.${CONTROL_CLASS} button[data-role="conversation-auto-sync"] {
  border-color: #d7b56d;
  color: #5a3d08;
  background: #fff8e8;
}
.${CONTROL_CLASS} button[data-role="conversation-auto-sync"][data-enabled="true"] {
  border-color: #2f7a4c;
  color: #155a32;
  background: #eaf8ef;
}
.${CONTROL_CLASS} button:disabled {
  cursor: default;
  opacity: 0.72;
}
.${CONTROL_CLASS} span {
  color: #617089;
}
.${CONTROL_CLASS}[data-state="synced"] span {
  color: #1f7a45;
}
.${CONTROL_CLASS}[data-state="error"] span {
  color: #b3261e;
}
`;
  document.documentElement.append(style);
}
