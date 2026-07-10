# Chat2Notion

Manifest V3 browser extension that syncs AI question/answer pairs to a Notion database.
Directly save the AI chat records you want to collect into the Notion database.

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
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

Load the generated `dist` directory from `chrome://extensions` or `edge://extensions`.

## Limitations

- **Platform-specific DOM selectors**: Each adapter relies on CSS class names and data attributes that platforms can change at any time. If a site redesigns its DOM, the corresponding adapter stops detecting messages until selectors are updated.
- **Virtualized lists**: Platforms that virtualize their message list (e.g., DeepSeek) only scan currently mounted/visible items. Messages scrolled out of view are not detected until they re-enter the viewport.
- **One Q&A pair at a time**: The extension syncs individual assistant answers. There is no batch-select or bulk-export for an entire conversation in one click.
- **Per-conversation auto-sync**: Auto-save is keyed by conversation URL. Starting a new chat or switching tabs resets the auto-save state.
- **Content script constraints**: Content scripts run as IIFEs with no top-level `import`/`export`, which limits what libraries or patterns can be used directly in the injected script.
- **Notion API rate limits**: The Notion API enforces rate limits (429). The extension retries automatically, but heavy use may still hit delays or temporary failures.
- **Large content downgrade**: If a single Q&A pair exceeds Notion's request size limit, question/answer properties are reduced to preview text and the full content is preserved only in the page body Markdown.
- **Notion-only**: The extension targets Notion databases/pages only. There is no support for other note-taking or knowledge-base platforms.
- **No offline queue**: Syncs require an active internet connection and a valid Notion API key. Failed syncs must be retried manually.
- **No sync history or undo**: There is no built-in log of past syncs or a way to bulk-undo/delete synced pages from the extension.

## TODO

- [ ] Add more platform adapters as new AI chat services emerge
- [ ] Conversation-level bulk export (sync an entire chat history to one Notion page)
- [ ] Offline sync queue — defer and replay failed syncs when the connection recovers
- [ ] Sync history and undo — view past syncs and delete or resync from the popup
- [ ] Detect edited messages and offer re-sync of changed Q&A pairs
- [ ] Better streaming detection for platforms with complex or multi-phase streaming behavior
- [ ] Image handling — inline images in AI responses preserved as Notion image blocks
- [ ] Code syntax highlighting preservation in Notion code blocks
- [ ] Support for Notion AI features (e.g., Notion Q&A on synced pages)
- [ ] Extension settings sync across browsers via cloud storage
- [ ] Batch-select mode — multi-select Q&A pairs and sync them all at once
- [ ] Adapter test harness — automated DOM fixture tests for each platform adapter
- [ ] Improved error messages and user guidance for common setup failures
- [ ] Support for Notion workspaces with granular permission models
- [ ] Multi-turn conversation grouping — optionally merge consecutive turns into a single Notion page
