# Chat2Notion

Manifest V3 browser extension that syncs ChatGPT question/answer pairs to a Notion database.

## Behavior

- Each ChatGPT answer gets a manual `Sync to Notion` button.
- `Auto-save chat` enables automatic Notion sync for the current ChatGPT conversation only.
- The popup-level global auto-sync is still available, but it is intended to stay off for normal use.
- Versioning starts at `0.1.xx` for small updates.

## Development

```bash
npm install
npm run typecheck
npm run build
```

Load the generated `dist` directory from `chrome://extensions` or `edge://extensions`.
