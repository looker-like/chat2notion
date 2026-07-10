// Extension popup and options page logic.
// Runs as an IIFE in the popup context; communicates with the background
// worker to read/write config, test connections, and run page diagnostics.

import { sendMessage, getResponseMessage, toErrorMessage } from "./messenger";
import { renderConfig } from "./renderer";

(() => {
  // --- DOM references ---
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

  // --- Bootstrap ---
  void initialize();

  async function initialize(): Promise<void> {
    bindEvents();

    try {
      const response = await sendMessage({ type: "chat2notion:getConfig" });

      if (!response.ok || !("config" in response)) {
        throw new Error(getResponseMessage(response, "Could not load configuration."));
      }

      renderConfig(response.config, apiKeyInput, databaseIdInput, autoSyncInput, lastSyncNode, connectionBadge);
      setStatus("Configuration loaded.", "neutral");
    } catch (error) {
      setStatus(toErrorMessage(error), "error");
    }
  }

  // --- Event binding ---

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

  // --- Actions ---

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
      renderConfig(response.config, apiKeyInput, databaseIdInput, autoSyncInput, lastSyncNode, connectionBadge);
    }
  }

  function collectConfigInput(): { apiKey: string; databaseId: string; autoSyncEnabled: boolean } {
    return {
      apiKey: apiKeyInput.value,
      databaseId: databaseIdInput.value,
      autoSyncEnabled: autoSyncInput.checked,
    };
  }

  // --- UI helpers ---

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

  // --- Local helpers ---

  function readDiagnostics(response: unknown): { aiName: string; controlCount: number; pairCount: number; assistantCount: number; ready: boolean } {
    if (!response || typeof response !== "object") {
      throw new Error("No diagnostics response from the current tab.");
    }

    const diagnostics = (response as { diagnostics?: { aiName: string; controlCount: number; pairCount: number; assistantCount: number; ready: boolean } }).diagnostics;

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
