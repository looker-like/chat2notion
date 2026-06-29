import {
  normalizeMarkdown,
  elementToMarkdown,
  childrenToMarkdown,
  blockMarkdown,
  headingToMarkdown,
  anchorToMarkdown,
  normalizeHref,
  wrapInlineMarkdown,
  inlineCodeToMarkdown,
  codeBlockToMarkdown,
  blockquoteToMarkdown,
  listToMarkdown,
  tableToMarkdown,
  imageToMarkdown,
  escapeMarkdownLinkText,
  escapeMarkdownUrl,
} from "./markdown";
import { PlatformAdapter, PLATFORM_ADAPTERS, FALLBACK_ADAPTER } from "./adapters";
(() => {
  const CONTROL_CLASS = "c2n-control";
  const CONTROL_ATTRIBUTE = "data-chat2notion-control";
  const ASSISTANT_PROCESSED_ATTRIBUTE = "data-chat2notion-processed";
  const AUTO_SYNCED_ATTRIBUTE = "data-chat2notion-auto-synced";
  const CONFIG_STORAGE_KEY = "chat2notionConfig";
  const CONVERSATION_AUTO_SYNC_STORAGE_KEY = "chat2notionConversationAutoSync";
  const OBSERVER_DEBOUNCE_MS = 700;
  const AUTO_SYNC_STABILITY_MS = 2200;
  const MIN_AUTO_SYNC_ANSWER_LENGTH = 2;

  interface ChatPair {
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

  interface MessageContent {
    text: string;
    markdown: string;
  }

  type SyncMode = "manual" | "auto";
  type RuntimeResponse =
    | { ok: true; config: { autoSyncEnabled: boolean } }
    | { ok: true; synced: boolean; notionPageId?: string }
    | { ok: true; message?: string; notionPageId?: string }
    | { ok: false; message: string };

  interface ControlNodes {
    root: HTMLDivElement;
    button: HTMLButtonElement;
    openButton: HTMLButtonElement;
    autoButton: HTMLButtonElement;
    status: HTMLSpanElement;
  }

  let autoSyncEnabled = false;
  let conversationAutoSyncEnabled = false;
  let conversationKey = createConversationKey();
  let scanTimer: number | null = null;
  let observer: MutationObserver | null = null;
  let extensionContextValid = true;
  const autoSyncTimers = new Map<string, number>();

  void initialize();

  async function initialize(): Promise<void> {
    ensureStyles();
    await refreshConfig();
    await refreshConversationAutoSync();
    scanPage();
    observeChat();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[CONFIG_STORAGE_KEY]) {
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
    const stored = await safeStorageGet(CONVERSATION_AUTO_SYNC_STORAGE_KEY);
    const state = readConversationAutoSyncState(stored[CONVERSATION_AUTO_SYNC_STORAGE_KEY]);
    conversationAutoSyncEnabled = Boolean(state[conversationKey]);
  }

  async function handleLocationChanged(): Promise<void> {
    conversationKey = createConversationKey();
    await refreshConversationAutoSync();
    scheduleScan(100);
  }

  function observeChat(): void {
    observer?.disconnect();
    observer = new MutationObserver(() => scheduleScan(OBSERVER_DEBOUNCE_MS));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function scheduleScan(delay: number): void {
    if (!extensionContextValid) {
      return;
    }

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
    const adapter = getCurrentAdapter();

    if (adapter.id === "deepseek") {
      const deepSeekRows = getDeepSeekAssistantRows();

      if (deepSeekRows.length > 0) {
        return deepSeekRows;
      }
    }

    if (adapter.id === "doubao") {
      const doubaoMessages = getDoubaoAssistantMessages();

      if (doubaoMessages.length > 0) {
        return doubaoMessages;
      }
    }

    const bySelector = querySelectorList(adapter.assistantSelectors);

    if (bySelector.length > 0) {
      return filterMessageNodes(bySelector);
    }

    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));
    return articles.filter((article) => {
      const text = article.textContent?.trim() ?? "";
      const ariaLabel = article.getAttribute("aria-label") ?? "";
      return text && adapter.assistantArticlePattern.test(ariaLabel) && !isInsideChat2NotionControl(article);
    });
  }

  function getUserMessages(): HTMLElement[] {
    const adapter = getCurrentAdapter();

    if (adapter.id === "doubao") {
      const doubaoMessages = getDoubaoUserMessages();

      if (doubaoMessages.length > 0) {
        return doubaoMessages;
      }
    }

    const bySelector = querySelectorList(adapter.userSelectors);

    if (bySelector.length > 0) {
      return filterMessageNodes(bySelector);
    }

    const articles = Array.from(document.querySelectorAll<HTMLElement>("article"));
    return articles.filter((article) => adapter.userArticlePattern.test(article.getAttribute("aria-label") ?? ""));
  }

  function getCurrentAdapter(): PlatformAdapter {
    const host = location.hostname.toLowerCase();
    return (
      PLATFORM_ADAPTERS.find((adapter) =>
        adapter.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)),
      ) ?? FALLBACK_ADAPTER
    );
  }

  function querySelectorList(selectors: string[]): HTMLElement[] {
    const seen = new Set<HTMLElement>();
    const nodes: HTMLElement[] = [];

    selectors.forEach((selector) => {
      document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
        if (!seen.has(node)) {
          seen.add(node);
          nodes.push(node);
        }
      });
    });

    return nodes;
  }

  function filterMessageNodes(nodes: HTMLElement[]): HTMLElement[] {
    const candidates = nodes.filter((node) => {
      const text = node.textContent?.trim() ?? "";
      return text && !isInsideChat2NotionControl(node) && !node.closest(`[${CONTROL_ATTRIBUTE}]`);
    });

    return candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)));
  }

  function buildChatPair(assistant: HTMLElement): ChatPair | null {
    const adapter = getCurrentAdapter();
    const answer = extractMessageContent(assistant, adapter);

    if (!answer.text) {
      return null;
    }

    const user = findPreviousUserMessage(assistant);
    const question = user ? extractMessageContent(user, adapter) : { text: "", markdown: "" };

    if (!question.text) {
      return null;
    }

    const sourceUrl = location.href;
    const messageId = createMessageId(question.text, answer.text, sourceUrl, adapter.id);

    return {
      assistant,
      aiName: adapter.aiName,
      platformId: adapter.id,
      question: question.text,
      questionMarkdown: question.markdown,
      answer: answer.text,
      answerMarkdown: answer.markdown,
      messageId,
      sourceUrl,
    };
  }

  function findPreviousUserMessage(assistant: HTMLElement): HTMLElement | null {
    const adapter = getCurrentAdapter();

    if (adapter.id === "deepseek") {
      const deepSeekUser = findPreviousDeepSeekUserMessage(assistant);

      if (deepSeekUser) {
        return deepSeekUser;
      }
    }

    if (adapter.id === "doubao") {
      const doubaoUser = findPreviousDoubaoUserMessage(assistant);

      if (doubaoUser) {
        return doubaoUser;
      }
    }

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

  function getDoubaoAssistantMessages(): HTMLElement[] {
    const explicitMessages = querySelectorList([
      "div[data-testid='receive_message']",
      "[data-testid='receive_message']",
    ]);

    if (explicitMessages.length > 0) {
      return filterMessageNodes(explicitMessages);
    }

    return filterMessageNodes(getDoubaoMessageRows().filter(isDoubaoAssistantRow));
  }

  function getDoubaoUserMessages(): HTMLElement[] {
    const explicitMessages = querySelectorList(["div[data-testid='send_message']", "[data-testid='send_message']"]);

    if (explicitMessages.length > 0) {
      return filterMessageNodes(explicitMessages);
    }

    return filterMessageNodes(getDoubaoMessageRows().filter(isDoubaoUserRow));
  }

  function findPreviousDoubaoUserMessage(assistant: HTMLElement): HTMLElement | null {
    const row = getDoubaoMessageRow(assistant);
    let previous = row?.previousElementSibling ?? null;

    while (previous) {
      if (previous instanceof HTMLElement && isDoubaoUserRow(previous)) {
        return previous.querySelector<HTMLElement>("[data-testid='send_message']") ?? previous;
      }

      previous = previous.previousElementSibling;
    }

    return null;
  }

  function getDoubaoMessageRows(): HTMLElement[] {
    return querySelectorList(["div[data-testid='union_message']", "[data-testid='union_message']"]);
  }

  function getDoubaoMessageRow(node: HTMLElement): HTMLElement | null {
    return (
      node.closest<HTMLElement>("[data-testid='union_message']") ??
      node.closest<HTMLElement>("[data-testid='receive_message']")
    );
  }

  function isDoubaoAssistantRow(row: HTMLElement): boolean {
    return Boolean(
      row.matches("[data-testid='receive_message']") ||
      row.querySelector("[data-testid='receive_message']") ||
      (row.querySelector("[data-testid='message_text_content']") &&
        !isDoubaoUserRow(row) &&
        (row.querySelector("[data-testid='message_action_copy']") ||
          row.querySelector("[data-testid='message_action_dislike']"))),
    );
  }

  function isDoubaoUserRow(row: HTMLElement): boolean {
    return Boolean(row.matches("[data-testid='send_message']") || row.querySelector("[data-testid='send_message']"));
  }

  function getDeepSeekAssistantRows(): HTMLElement[] {
    const container = getDeepSeekMessageContainer();

    if (!container) {
      return [];
    }

    return Array.from(container.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && isDeepSeekAssistantRow(node),
    );
  }

  function findPreviousDeepSeekUserMessage(assistant: HTMLElement): HTMLElement | null {
    const row = getDeepSeekMessageRow(assistant);
    let previous = row?.previousElementSibling ?? null;

    while (previous) {
      if (previous instanceof HTMLElement && isDeepSeekUserRow(previous)) {
        return previous;
      }

      previous = previous.previousElementSibling;
    }

    return null;
  }

  function getDeepSeekMessageContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".ds-virtual-list-visible-items");
  }

  function getDeepSeekMessageRow(node: HTMLElement): HTMLElement | null {
    const container = getDeepSeekMessageContainer();

    if (!container) {
      return null;
    }

    return (
      Array.from(container.children).find(
        (child): child is HTMLElement => child instanceof HTMLElement && (child === node || child.contains(node)),
      ) ?? null
    );
  }

  function isDeepSeekAssistantRow(row: HTMLElement): boolean {
    return Boolean(row.querySelector("div.ds-markdown")) && !isInsideChat2NotionControl(row);
  }

  function isDeepSeekUserRow(row: HTMLElement): boolean {
    if (row.matches("._9663006") || row.querySelector("._9663006")) {
      return true;
    }

    const text = row.textContent?.trim() ?? "";
    return Boolean(text) && !row.querySelector("div.ds-markdown") && !isInsideChat2NotionControl(row);
  }

  function ensureControl(pair: ChatPair): void {
    pair.assistant.setAttribute(ASSISTANT_PROCESSED_ATTRIBUTE, "true");

    const insertionTarget = findInsertionTarget(pair.assistant);
    const existing = findExistingControl(pair.assistant, insertionTarget, pair.messageId);
    const control = existing ? readControl(existing) : createControl(pair);

    if (!existing) {
      insertionTarget.append(control.root);
    }

    removeDuplicateControls(insertionTarget, control.root);
    control.root.dataset.messageId = pair.messageId;
    control.button.onclick = () => {
      void handleManualSync(pair, control);
    };
    control.openButton.onclick = () => {
      openNotionPage(control);
    };
    control.autoButton.onclick = () => {
      void toggleConversationAutoSync(pair, control);
    };
    syncConversationAutoButton(control);
    syncOpenButton(control);

    void initializeSyncedState(pair.messageId, control);
  }

  function createControl(pair: ChatPair): ControlNodes {
    const root = document.createElement("div");
    root.className = CONTROL_CLASS;
    root.setAttribute(CONTROL_ATTRIBUTE, "true");
    root.dataset.messageId = pair.messageId;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.role = "sync";
    button.textContent = "Sync to Notion";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.dataset.role = "notion-open";
    openButton.textContent = "Open in Notion";
    openButton.hidden = true;

    const autoButton = document.createElement("button");
    autoButton.type = "button";
    autoButton.dataset.role = "conversation-auto-sync";

    const status = document.createElement("span");
    status.textContent = "";

    root.append(button, openButton, autoButton, status);
    return { root, button, openButton, autoButton, status };
  }

  function readControl(root: HTMLDivElement): ControlNodes {
    const button =
      root.querySelector<HTMLButtonElement>("button[data-role='sync']") ??
      Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((node) => {
        const role = node.dataset.role;
        return role !== "conversation-auto-sync" && role !== "notion-open";
      }) ??
      document.createElement("button");
    const openButton =
      root.querySelector<HTMLButtonElement>("button[data-role='notion-open']") ?? document.createElement("button");
    const autoButton =
      root.querySelector<HTMLButtonElement>("button[data-role='conversation-auto-sync']") ??
      document.createElement("button");
    const status = root.querySelector<HTMLSpanElement>("span") ?? document.createElement("span");

    if (!button.parentElement) {
      button.type = "button";
      root.append(button);
    }

    button.dataset.role = "sync";
    button.textContent ||= "Sync to Notion";

    if (!openButton.parentElement) {
      openButton.type = "button";
      openButton.dataset.role = "notion-open";
      openButton.textContent = "Open in Notion";
      openButton.hidden = true;
      root.insertBefore(openButton, autoButton.parentElement ? autoButton : status.parentElement ? status : null);
    }

    if (!autoButton.parentElement) {
      autoButton.type = "button";
      autoButton.dataset.role = "conversation-auto-sync";
      root.append(autoButton);
    }

    if (!status.parentElement) {
      root.append(status);
    }

    return { root, button, openButton, autoButton, status };
  }

  function findInsertionTarget(assistant: HTMLElement): HTMLElement {
    if (getCurrentAdapter().id === "doubao") {
      return (
        assistant.closest<HTMLElement>("[data-testid='union_message']") ??
        assistant.closest<HTMLElement>("[data-testid='receive_message']") ??
        assistant
      );
    }

    const article = assistant.closest<HTMLElement>("article");
    return article ?? assistant;
  }

  function findExistingControl(
    assistant: HTMLElement,
    insertionTarget: HTMLElement,
    messageId: string,
  ): HTMLDivElement | null {
    const assistantControl = assistant.querySelector<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`);

    if (assistantControl) {
      return assistantControl;
    }

    const directControls = Array.from(insertionTarget.children).filter((node): node is HTMLDivElement => {
      return node instanceof HTMLDivElement && node.hasAttribute(CONTROL_ATTRIBUTE);
    });

    return directControls.find((node) => node.dataset.messageId === messageId) ?? directControls[0] ?? null;
  }

  function removeDuplicateControls(insertionTarget: HTMLElement, keep: HTMLDivElement): void {
    Array.from(insertionTarget.children).forEach((node) => {
      if (node instanceof HTMLDivElement && node !== keep && node.hasAttribute(CONTROL_ATTRIBUTE)) {
        node.remove();
      }
    });
  }

  async function initializeSyncedState(messageId: string, control: ControlNodes): Promise<void> {
    const response = await sendMessage({ type: "chat2notion:isSynced", messageId });

    if (response.ok && "synced" in response && response.synced) {
      setNotionPageId(control, response.notionPageId ?? "");
      setControlState(control, "synced", "Synced");
    }
  }

  async function handleManualSync(pair: ChatPair, control: ControlNodes): Promise<void> {
    if (control.root.dataset.state === "synced") {
      const confirmed = window.confirm("This answer is already synced. Resync and overwrite the existing Notion page?");

      if (!confirmed) {
        return;
      }

      await syncPair(pair, control, "manual", true);
      return;
    }

    await syncPair(pair, control, "manual");
  }

  async function toggleConversationAutoSync(pair: ChatPair, control: ControlNodes): Promise<void> {
    const nextEnabled = !conversationAutoSyncEnabled;
    const saved = await setConversationAutoSync(nextEnabled);

    if (!saved) {
      setControlState(control, "error", "Extension was reloaded. Refresh this AI chat tab.");
      return;
    }

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

  async function setConversationAutoSync(enabled: boolean): Promise<boolean> {
    const stored = await safeStorageGet(CONVERSATION_AUTO_SYNC_STORAGE_KEY);

    if (!extensionContextValid) {
      return false;
    }

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

    return safeStorageSet({ [CONVERSATION_AUTO_SYNC_STORAGE_KEY]: state });
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
      ? "Disable automatic Notion sync for this AI conversation."
      : "Enable automatic Notion sync for this AI conversation.";
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

      const controlRoot = findExistingControl(pair.assistant, findInsertionTarget(pair.assistant), pair.messageId);

      if (!controlRoot) {
        return;
      }

      void syncPair(latestPair, readControl(controlRoot), "auto");
    }, AUTO_SYNC_STABILITY_MS);

    autoSyncTimers.set(pair.messageId, timer);
  }

  async function syncPair(pair: ChatPair, control: ControlNodes, syncMode: SyncMode, overwrite = false): Promise<void> {
    setControlState(
      control,
      "pending",
      overwrite ? "Resyncing..." : syncMode === "auto" ? "Auto-syncing..." : "Syncing...",
    );

    const response = await sendMessage({
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

  function setControlState(
    control: ControlNodes,
    state: "idle" | "pending" | "synced" | "error",
    message: string,
  ): void {
    control.root.dataset.state = state;
    control.status.textContent = message;
    control.button.disabled = state === "pending";
    control.button.textContent = state === "synced" ? "Synced" : state === "pending" ? "Syncing" : "Sync to Notion";
    control.button.title = state === "synced" ? "Click to resync and overwrite the existing Notion page." : "";
    control.autoButton.disabled = state === "pending";
    syncOpenButton(control);
  }

  function setControlStatus(control: ControlNodes, message: string): void {
    control.status.textContent = message;
  }

  function setNotionPageId(control: ControlNodes, notionPageId: string): void {
    if (notionPageId) {
      control.root.dataset.notionPageId = notionPageId;
    } else {
      delete control.root.dataset.notionPageId;
    }

    syncOpenButton(control);
  }

  function syncOpenButton(control: ControlNodes): void {
    const notionPageId = control.root.dataset.notionPageId ?? "";
    const hasPage = Boolean(notionPageId);
    control.openButton.hidden = !hasPage;
    control.openButton.disabled = !hasPage || control.root.dataset.state === "pending";
    control.openButton.title = hasPage ? "Open the synced Notion page in a new tab." : "";
  }

  function openNotionPage(control: ControlNodes): void {
    const notionPageId = control.root.dataset.notionPageId ?? "";

    if (!notionPageId) {
      setControlStatus(control, "No Notion page link is available yet.");
      return;
    }

    window.open(createNotionPageUrl(notionPageId), "_blank", "noopener,noreferrer");
  }

  function createNotionPageUrl(notionPageId: string): string {
    return `https://www.notion.so/${notionPageId.replace(/-/g, "")}`;
  }

  function isAnswerStillStreaming(assistant: HTMLElement): boolean {
    const selectors = getCurrentAdapter().streamingSelectors;
    return selectors.some((selector) => Boolean(assistant.querySelector(selector)));
  }

  async function sendMessage(message: object): Promise<RuntimeResponse> {
    if (!extensionContextValid) {
      return { ok: false, message: "Extension was reloaded. Refresh this AI chat tab." };
    }

    try {
      return (await chrome.runtime.sendMessage(message)) as RuntimeResponse;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleExtensionContextInvalidated();
        return { ok: false, message: "Extension was reloaded. Refresh this AI chat tab." };
      }

      return { ok: false, message: toErrorMessage(error, "Could not contact Chat2Notion background worker.") };
    }
  }

  async function safeStorageGet(key: string): Promise<Record<string, unknown>> {
    if (!extensionContextValid) {
      return {};
    }

    try {
      return (await chrome.storage.local.get(key)) as Record<string, unknown>;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleExtensionContextInvalidated();
      }

      return {};
    }
  }

  async function safeStorageSet(value: Record<string, unknown>): Promise<boolean> {
    if (!extensionContextValid) {
      return false;
    }

    try {
      await chrome.storage.local.set(value);
      return true;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleExtensionContextInvalidated();
      }

      return false;
    }
  }

  function handleExtensionContextInvalidated(): void {
    if (!extensionContextValid) {
      return;
    }

    extensionContextValid = false;
    observer?.disconnect();
    observer = null;

    if (scanTimer !== null) {
      window.clearTimeout(scanTimer);
      scanTimer = null;
    }

    autoSyncTimers.forEach((timer) => window.clearTimeout(timer));
    autoSyncTimers.clear();

    document.querySelectorAll<HTMLDivElement>(`[${CONTROL_ATTRIBUTE}]`).forEach((root) => {
      setControlState(readControl(root), "error", "Extension was reloaded. Refresh this AI chat tab.");
    });
  }

  function isExtensionContextInvalidated(error: unknown): boolean {
    return toErrorMessage(error, "").includes("Extension context invalidated");
  }

  function toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function getResponseMessage(response: RuntimeResponse, fallback: string): string {
    return "message" in response && typeof response.message === "string" ? response.message : fallback;
  }

  function createMessageId(question: string, answer: string, sourceUrl: string, platformId: string): string {
    const url = new URL(sourceUrl);
    const platformSeed = platformId === "chatgpt" ? "" : `${platformId}|`;
    const seed = `${platformSeed}${url.origin}${url.pathname}|${normalizeText(question)}|${normalizeText(answer).slice(0, 600)}|${answer.length}`;
    return `${platformId}-${hashString(seed)}`;
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
    return value
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function createConversationKey(): string {
    const url = new URL(location.href);
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/new-chat"}`;
  }

  function readConversationAutoSyncState(
    value: unknown,
  ): Record<string, { enabled: true; sourceUrl: string; updatedAt: string }> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, { enabled: true; sourceUrl: string; updatedAt: string }] => {
          const item = entry[1];
          return (
            typeof item === "object" &&
            item !== null &&
            !Array.isArray(item) &&
            (item as { enabled?: unknown }).enabled === true &&
            typeof (item as { sourceUrl?: unknown }).sourceUrl === "string" &&
            typeof (item as { updatedAt?: unknown }).updatedAt === "string"
          );
        },
      ),
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

  function extractMessageContent(message: HTMLElement, adapter = getCurrentAdapter()): MessageContent {
    const clone = message.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`[${CONTROL_ATTRIBUTE}], script, style, button, svg`).forEach((node) => node.remove());

    let elements: HTMLElement[] = [];

    // Find all independent content blocks matching the first successful selector
    for (const selector of adapter.contentSelectors) {
      if (clone.matches(selector)) {
        elements = [clone];
        break;
      }

      const children = Array.from(clone.querySelectorAll<HTMLElement>(selector)).filter(
        (node) => !isInsideChat2NotionControl(node),
      );

      if (children.length > 0) {
        // Filter out nested matches
        elements = children.filter((child) => !children.some((other) => other !== child && other.contains(child)));
        break;
      }
    }

    if (elements.length === 0) {
      elements = [clone];
    }

    const parts = elements
      .map((block) => ({
        text: normalizeText(block.innerText || block.textContent || ""),
        markdown: normalizeMarkdown(elementToMarkdown(block)),
      }))
      .filter((block) => block.text || block.markdown);

    if (parts.length === 0) {
      const text = normalizeText(clone.innerText || clone.textContent || "");
      const markdown = normalizeMarkdown(elementToMarkdown(clone)) || text;
      return { text, markdown };
    }

    if (parts.length === 1) {
      return {
        text: normalizeText(parts[0].text || parts[0].markdown),
        markdown: normalizeMarkdown(parts[0].markdown || parts[0].text),
      };
    }

    // For multiple blocks (e.g. ChatGLM, DeepSeek, Doubao, Kimi), treat all but the last as Reasoning / Search Process
    const reasoningBlocks = parts.slice(0, -1);
    const answerBlock = parts[parts.length - 1];

    const reasoningText = normalizeText(reasoningBlocks.map((block) => block.text || block.markdown).join("\n\n"));
    const answerText = normalizeText(answerBlock.text || answerBlock.markdown);
    const reasoningMarkdown = normalizeMarkdown(
      reasoningBlocks.map((block) => block.markdown || block.text).join("\n\n"),
    );
    const answerMarkdown = normalizeMarkdown(answerBlock.markdown || answerBlock.text);

    const text = normalizeText(["思考内容", reasoningText, "正式回答", answerText].join("\n\n"));
    const markdown = normalizeMarkdown(
      [
        "<details><summary><h2>思考内容</h2></summary>",
        reasoningMarkdown,
        "</details>",
        "<details><summary><h2>正式回答</h2></summary>",
        answerMarkdown,
        "</details>",
      ].join("\n\n"),
    );

    return { text, markdown };
  }
})();
