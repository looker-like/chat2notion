# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Chat2Notion is a Manifest V3 browser extension (Chrome/Edge) that syncs AI question/answer pairs to a Notion database. It targets ~19 AI chat platforms via content scripts and a background service worker.

## Commands

```bash
pnpm install
pnpm run dev        # Start Vite dev server (reload extension from dist/ on changes)
pnpm run build      # Production build to dist/ via custom TS transpile script
pnpm run typecheck  # tsc --noEmit
pnpm run check      # Line-limit check (300 lines) + typecheck + build + lint
pnpm test           # Node built-in test runner: platform coverage, manifest consistency, contract tests
pnpm run e2e:check  # Playwright-based e2e validation
pnpm run lint       # ESLint flat config
pnpm run format     # Prettier (120 char width, 2-space indent, no semicolons issues)
```

Tests run via `node:test` — no external test runner. Run a single test file with `node scripts/test.mjs` (the script is self-contained; individual test files are not separated).

## Architecture

### Extension entry points
- **Background** (`src/background/`): Service worker (`background.ts`) that handles runtime messages, settings, Notion API calls, and sync orchestration. Persists state via `chrome.storage.local`.
- **Content** (`src/content/`): Injected into AI chat pages. Uses a `MutationObserver` to scan for assistant messages, injects UI controls (Sync / Open in Notion / Auto-save buttons), and coordinates with the background via `chrome.runtime.sendMessage`.
- **Popup** (`src/popup/`): Extension popup and settings page (shared HTML). Reads/writes config, tests connection, shows diagnostics.

### Platform adapter system
Each AI platform is a `PlatformAdapter` in `src/content/adapters/`. The adapter defines CSS selectors for assistant/user messages, article pattern matching, and streaming detection. `platform.ts` selects the adapter by hostname and provides `getAssistantMessages()`, `buildChatPair()`, and `findPreviousUserMessage()`.

DeepSeek and Doubao have special handling:
- **DeepSeek**: Uses its virtualized visible list (`.ds-virtual-list-visible-items`) so only currently mounted answers are scanned. Multi-block reasoning/answers are merged.
- **Doubao**: Uses `data-testid='union_message'` rows; nested control insertion targets are handled separately.

A `FALLBACK_ADAPTER` provides heuristic selectors for unknown platforms.

### Notion sync flow
1. Content script builds a `ChatPair` (question/answer text + markdown + source URL + message ID).
2. Sends `chat2notion:syncPair` to background.
3. Background ensures the target Notion database/data source exists, then creates or updates a Notion page.
4. Page content includes a Markdown backup (links, headings, lists, code, tables). Long content is batched; oversized requests downgrade properties to previews.
5. Response returns a `notionPageId`; content script updates the button state and stores the page ID.

### Sync states and controls
Each AI answer gets an injected control bar with three buttons and a status label. States: `idle` → `pending` → `synced` / `error`. Controls are deduplicated via `data-chat2notion-control` attributes.

### Conversation auto-sync
Per-conversation auto-sync is stored in `chrome.storage.local` keyed by a conversation key derived from the URL. The global auto-sync toggle in the popup exists but is intended to stay off for normal use.

## Key Constraints and Patterns

- **300-line file limit**: Enforced by `pnpm run check`. Keep files under 300 lines; split when approaching this.
- **Build is custom, not Vite bundling**: `scripts/build.mjs` walks `src/`, transpiles `.ts` → `.js` with TypeScript's `transpileModule`, copies `.html`, and rewrites relative imports to `.js` extensions. `vite build` uses `@crxjs/vite-plugin` for development only.
- **Content scripts must be plain JS**: No top-level `import`/`export` in content script or popup output. The build verifier enforces this.
- **Popup HTML uses classic scripts**: No `type="module"` on the popup script tag (build verifier enforces this).
- **Package versions must sync**: `package.json` version must match `manifest.config.ts` version; enforced in `pnpm test`.
- **No secrets in code**: Config (API key, database ID) is stored in `chrome.storage.local`, never in source.
- **Prettier config**: 120 char print width, 2-space indent, trailing commas always, double quotes.
- **pnpm is the package manager** (v10.27.0). Use `pnpm`, not `npm` or `yarn`.

## Adding a New Platform Adapter

1. Create `src/content/adapters/<platform>.ts` exporting a `PlatformAdapter`.
2. Import and register it in `src/content/adapters.ts` `PLATFORM_ADAPTERS` array.
3. Add host patterns to `manifest.config.ts` `content_scripts[0].matches` and `host_permissions`.
4. Add the platform to `scripts/test.mjs` `expectedPlatforms` array (id, aiName, hosts, match).
5. Add the `aiName` to `getMissingAiSelectOptions()` in the background so the Notion `AI` select field includes it.

## Important Files

- `manifest.config.ts` — @crxjs manifest source (dev mode)
- `src/shared/config.ts` — Shared types: config, sync payloads, runtime message contracts
- `src/content/constants.ts` — CSS class names, attribute names, debounce timings, SVG icons
- `src/background/notion-client.ts` — Notion API fetch wrapper with 429 retry
- `src/background/notion-pages.ts` — Page create/update logic and payload assertions
- `src/background/schema.ts` — Notion database schema creation and property initialization
- `src/background/request-size.ts` — Payload size estimation; downgrades to previews when too large
- `test-dom.html` — Standalone DOM fixture for local adapter testing in a browser
