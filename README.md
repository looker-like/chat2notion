# Chat2Notion

Manifest V3 browser extension that syncs AI question/answer pairs to a Notion database.

## Behavior

- ChatGPT, Gemini, DeepSeek, Claude, Grok, Perplexity, Copilot, Poe, Mistral, Meta AI, Doubao, Kimi, Qwen, Yuanbao, ChatGLM, ERNIE, HuggingChat, Duck.ai, and You.com answer nodes get a manual `Sync to Notion` button where the page DOM can be detected.
- DeepSeek uses its virtualized visible message list for button injection, so only currently mounted answers are scanned.
- DeepSeek answer extraction merges every `.ds-markdown` block in a visible AI row so reasoning-model answers are not truncated at the first thought block.
- When DeepSeek exposes multiple answer blocks, synced content is separated with `## 思考内容` and `## 正式回答` headings.
- `Auto-save chat` enables automatic Notion sync for the current AI conversation only.
- The popup-level global auto-sync is still available, but it is intended to stay off for normal use.
- The popup includes an `Open full settings page` button for cases where pasting from another app would close the popup.
- Configuration input is saved locally before Notion validation, so a failed setup does not erase the API key or target ID.
- If the target ID is an empty Notion page, the extension creates a `Chat2Notion` database inside it.
- If the target ID is a Notion database, the extension initializes missing required fields on its data source.
- Synced Notion pages also include a Markdown content backup so links, headings, lists, quotes, code blocks, and tables are not limited to plain database properties.
- Long page backups are appended in batches; if full question/answer properties would make the create request too large, those properties become previews and the full content remains in the page body.
- A synced answer button remains clickable; confirming the prompt resyncs and overwrites the existing Notion page instead of creating a duplicate.
- After a sync stores a Notion page ID, the answer controls show an `Open in Notion` button for that page.
- The Notion `AI` select field is written from the current platform adapter.
- Versioning starts at `0.1.xx` for small updates.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Load the generated `dist` directory from `chrome://extensions` or `edge://extensions`.
