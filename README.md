# Chat2Notion

Manifest V3 browser extension that syncs ChatGPT question/answer pairs to a Notion database.

## Behavior

- Each ChatGPT answer gets a manual `Sync to Notion` button.
- `Auto-save chat` enables automatic Notion sync for the current ChatGPT conversation only.
- The popup-level global auto-sync is still available, but it is intended to stay off for normal use.
- The popup includes an `Open full settings page` button for cases where pasting from another app would close the popup.
- Configuration input is saved locally before Notion validation, so a failed setup does not erase the API key or target ID.
- If the target ID is an empty Notion page, the extension creates a `Chat2Notion` database inside it.
- If the target ID is a Notion database, the extension initializes missing required fields on its data source.
- Versioning starts at `0.1.xx` for small updates.

## Development

```bash
npm install
npm run typecheck
npm run build
```

Load the generated `dist` directory from `chrome://extensions` or `edge://extensions`.
