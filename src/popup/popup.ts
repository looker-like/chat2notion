(() => {
  const apiKeyInput = query<HTMLInputElement>("#apiKey");
  const databaseIdInput = query<HTMLInputElement>("#databaseId");
  const autoSyncInput = query<HTMLInputElement>("#autoSyncEnabled");
  const toggleSecretButton = query<HTMLButtonElement>("#toggleSecret");
  const openSettingsPageButton = query<HTMLButtonElement>("#openSettingsPage");
  const testConnectionButton = query<HTMLButtonElement>("#testConnection");
  const saveConfigButton = query<HTMLButtonElement>("#saveConfig");
  const diagnosePageButton = query<HTMLButtonElement>("#diagnosePage");
  const statusNode = query<HTMLParagraphElement>("#status");
  const lastSyncNode = query<HTMLParagraphElement>("#lastSync");
  const pageDiagnosticsNode = query<HTMLParagraphElement>("#pageDiagnostics");
  const connectionBadge = query<HTMLSpanElement>("#connectionBadge");

  interface Chat2NotionConfig {
    apiKey: string;
    databaseId: string;
    dataSourceId: string;
    autoSyncEnabled: boolean;
    lastSyncStatus: { tone: "idle" | "success" | "error" | "pending"; message: string; at: string } | null;
  }

  type RuntimeResponse =
    { ok: true; config: Chat2NotionConfig } | { ok: true; message?: string } | { ok: false; message: string };

  interface PageDiagnostics {
    platformId: string;
    aiName: string;
    assistantCount: number;
    pairCount: number;
    controlCount: number;
    ready: boolean;
  }

  void initialize();

  async function initialize(): Promise<void> {
    bindEvents();

    try {
      const response = await sendMessage({ type: "chat2notion:getConfig" });

      if (!response.ok || !("config" in response)) {
        throw new Error(getResponseMessage(response, "Could not load configuration."));
      }

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

    openSettingsPageButton.addEventListener("click", () => {
      void chrome.runtime.openOptionsPage();
    });

    saveConfigButton.addEventListener("click", () => {
      void saveConfig();
    });

    testConnectionButton.addEventListener("click", () => {
      void testConnection();
    });

    diagnosePageButton.addEventListener("click", () => {
      void diagnosePage();
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
        await reloadConfig();
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
        await reloadConfig();
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

  async function diagnosePage(): Promise<void> {
    diagnosePageButton.disabled = true;
    pageDiagnosticsNode.textContent = "Checking current tab...";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error("No active tab found.");
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: "chat2notion:diagnosePage" });
      const diagnostics = readDiagnostics(response);
      pageDiagnosticsNode.textContent = diagnostics.ready
        ? `${diagnostics.aiName}: ${diagnostics.controlCount}/${diagnostics.pairCount} sync controls ready.`
        : `${diagnostics.aiName}: found ${diagnostics.assistantCount} assistant messages, ${diagnostics.controlCount} controls.`;
    } catch (error) {
      pageDiagnosticsNode.textContent = `${toErrorMessage(error)} Open a supported AI chat tab and refresh it.`;
    } finally {
      diagnosePageButton.disabled = false;
    }
  }

  async function reloadConfig(): Promise<void> {
    const response = await sendMessage({ type: "chat2notion:getConfig" });

    if (response.ok && "config" in response) {
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
    openSettingsPageButton.disabled = isBusy;
    testConnectionButton.disabled = isBusy;
    toggleSecretButton.disabled = isBusy;
    apiKeyInput.disabled = isBusy;
    databaseIdInput.disabled = isBusy;
    autoSyncInput.disabled = isBusy;
    diagnosePageButton.disabled = isBusy;
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

  function readDiagnostics(response: unknown): PageDiagnostics {
    if (!response || typeof response !== "object") {
      throw new Error("No diagnostics response from the current tab.");
    }

    const diagnostics = (response as { diagnostics?: PageDiagnostics }).diagnostics;

    if (!diagnostics) {
      throw new Error("Current tab did not return Chat2Notion diagnostics.");
    }

    return diagnostics;
  }

  function query<T extends Element>(selector: string): T {
    const node = document.querySelector<T>(selector);

    if (!node) {
      throw new Error(`Missing element: ${selector}`);
    }

    return node;
  }
})();
