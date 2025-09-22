# Copilot Instructions for Privacy Guard Userscript

## Project Overview

- **Purpose:** A userscript that blocks trackers, analytics, and intrusive elements on websites. It operates primarily by intercepting DOM and network APIs.
- **Entry Point:** `src/index.js` is the main entry point, which initializes the core logic.
- **Build Process:** The final userscript is built into `dist/privacy-guard.user.js` using Rollup (`npm run build`). The build process combines all modules and prepends a metadata header from `src/metadata.txt`.

## Architecture

- **Core Logic:** The central logic resides in `src/core/privacy-guard.js`. The `PrivacyGuard` object contains methods for intercepting APIs (`fetch`, `XHR`, `createElement`), scanning the DOM, and deciding whether to block a resource.
- **Configuration:**
  - Static configuration and feature flags are in `src/config.js` (e.g., `FEATURES`, `MODE`).
  - Blocker patterns are defined in `src/blocklist.js` and `src/allowlists.js`.
- **Per-Domain Overrides:** The script supports domain-specific settings. The `STORAGE` object in `src/storage.js` manages saving and retrieving these settings from `localStorage` using the prefix `PG_OVERRIDES::`.
- **Blocking Strategy:** The `PrivacyGuard.shouldBlock(url)` method is the single source of truth for blocking decisions. It checks a given URL against allowlists and blocklists. Blocking is achieved by:
  - Intercepting `document.createElement` to neutralize `<script>` tags before they are inserted.
  - Using a `MutationObserver` to scan for dynamically added elements.
  - Patching network APIs like `fetch`, `XMLHttpRequest`, and `navigator.sendBeacon` to prevent requests to blocked domains.

## Developer Workflows

- **Build:** To build the userscript, run `npm run build`. This generates the distributable file in the `dist/` directory.
- **Linting:** The project uses ESLint. Run `npm run lint` to check for and fix style issues. All code must be ESLint-compliant.
- **Testing:** Tests are written with Jest. Run them using `npm test`. Test files are located alongside the source files they test (e.g., `privacy-guard.test.js`).

## Key Patterns & Conventions

- **API Interception:** The primary mechanism for blocking is patching native browser APIs. When adding new blocking capabilities, prefer extending this pattern.
- **Immutability:** Use immutable data structures where possible.
- **Configuration over Code:** Feature toggles in `src/config.js` should be used to enable or disable functionality, rather than conditional logic scattered in the code.
- **Atomic Changes:** Only edit code directly relevant to the task. Do not refactor unrelated code in the same commit.
- **Error Handling:** Never fail silently. Use `console.debug` for logging and provide descriptive error messages.

## Examples

- **Adding a new blocked domain:** Add the domain string to the `BLOCKED_HOSTS` array in `src/blocklist.js`.
- **Adding a new feature toggle:** Add a new key to the `FEATURES` object in `src/config.js` and reference it in the relevant logic.
- **Adding a per-domain setting:** Extend the `STORAGE` object in `src/storage.js` and the override logic in `applyOverridesForHost` in `src/config.js`.

---

_If anything is unclear, please ask for clarification._
