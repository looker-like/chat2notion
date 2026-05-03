import { type Chat2NotionConfig, type RuntimeResponse } from "../shared/config";

const apiKeyInput = query<HTMLInputElement>("#apiKey");
const databaseIdInput = query<HTMLInputElement>("#databaseId");
const autoSyncInput = query<HTMLInputElement>("#autoSyncEnabled");
const toggleSecretButton = query<HTMLButtonElement>("#toggleSecret");
const testConnectionButton = query<HTMLButtonElement>("#testConnection");
const saveConfigButton = query<HTMLButtonElement>("#saveConfig");
const statusNode = query<HTMLParagraphElement>("#status");
const lastSyncNode = query<HTMLParagraphElement>("#lastSync");
const connectionBadge = query<HTMLSpanElement>("#connectionBadge");

let loadedConfig: Chat2NotionConfig | null = null;

void initialize();

async function initialize(): Promise<void> {
  bindEvents();

  try {
    const response = await sendMessage({ type: "chat2notion:getConfig" });

    if (!response.ok || !("config" in response)) {
      throw new Error(getResponseMessage(response, "Could not load configuration."));
    }

    loadedConfig = response.config;
    renderConfig(response.config);
    setStatus("Configuration loaded.", "neutral");
  } catch (error) {
    setStatus(toErrorMessage(error), "error");
  }
}

function bindEvents(): void {
  toggleSecretButton.addEventListener("click", () => {
    const visible = apiKeyInput.type === "text";
    apiKeyInput.type = visible ? "password" : "text";
    toggleSecretButton.textContent = visible ? "Show" : "Hide";
  });

  saveConfigButton.addEventListener("click", () => {
    void saveConfig();
  });

  testConnectionButton.addEventListener("click", () => {
    void testConnection();
  });
}

function renderConfig(config: Chat2NotionConfig): void {
  apiKeyInput.value = config.apiKey;
  databaseIdInput.value = config.databaseId;
  autoSyncInput.checked = config.autoSyncEnabled;
  renderLastSync(config);
  renderBadge(config);
}

function renderLastSync(config: Chat2NotionConfig): void {
  if (!config.lastSyncStatus) {
    lastSyncNode.textContent = "No sync recorded yet.";
    delete lastSyncNode.dataset.tone;
    return;
  }

  lastSyncNode.textContent = `${config.lastSyncStatus.message} (${formatDate(config.lastSyncStatus.at)})`;
  lastSyncNode.dataset.tone = config.lastSyncStatus.tone;
}

function renderBadge(config: Chat2NotionConfig): void {
  const configured = Boolean(config.apiKey && config.databaseId && config.dataSourceId);
  connectionBadge.textContent = configured ? "Ready" : "Not configured";
  connectionBadge.dataset.tone = configured ? "success" : "idle";
}

async function saveConfig(): Promise<void> {
  setBusy(true);
  setStatus("Saving and validating configuration...", "pending");

  try {
    const response = await sendMessage({
      type: "chat2notion:saveConfig",
      config: collectConfigInput(),
    });

    if (!response.ok) {
      throw new Error(response.message);
    }

    await reloadConfig();
    setStatus(getResponseMessage(response, "Configuration saved."), "success");
  } catch (error) {
    setStatus(toErrorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

async function testConnection(): Promise<void> {
  setBusy(true);
  setStatus("Testing Notion connection...", "pending");

  try {
    const response = await sendMessage({
      type: "chat2notion:testConnection",
      config: {
        apiKey: apiKeyInput.value,
        databaseId: databaseIdInput.value,
      },
    });

    if (!response.ok) {
      throw new Error(response.message);
    }

    await reloadConfig();
    setStatus(getResponseMessage(response, "Connected to Notion."), "success");
  } catch (error) {
    setStatus(toErrorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

async function reloadConfig(): Promise<void> {
  const response = await sendMessage({ type: "chat2notion:getConfig" });

  if (response.ok && "config" in response) {
    loadedConfig = response.config;
    renderConfig(response.config);
  }
}

function collectConfigInput(): Pick<Chat2NotionConfig, "apiKey" | "databaseId" | "autoSyncEnabled"> {
  return {
    apiKey: apiKeyInput.value,
    databaseId: databaseIdInput.value,
    autoSyncEnabled: autoSyncInput.checked,
  };
}

function setBusy(isBusy: boolean): void {
  saveConfigButton.disabled = isBusy;
  testConnectionButton.disabled = isBusy;
  toggleSecretButton.disabled = isBusy;
  apiKeyInput.disabled = isBusy;
  databaseIdInput.disabled = isBusy;
  autoSyncInput.disabled = isBusy;
}

function setStatus(message: string, tone: "neutral" | "pending" | "success" | "error"): void {
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
}

async function sendMessage(message: object): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}

function getResponseMessage(response: RuntimeResponse, fallback: string): string {
  return "message" in response && typeof response.message === "string" ? response.message : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected popup error.";
}

function query<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);

  if (!node) {
    throw new Error(`Missing element: ${selector}`);
  }

  return node;
}

void loadedConfig;
