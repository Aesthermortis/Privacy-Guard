# Copilot Instructions for Privacy Guard Userscript

## Project Overview

- **Purpose:** Blocks trackers and analytics on all sites via a userscript, with per-domain overrides and a UI panel.
- **Entry Point:** `privacy-guard.user.js` (userscript metadata and main logic).
- **Architecture:**
  - All logic is in a single userscript file (`privacy-guard.user.js`).
  - Feature toggles and runtime modes are defined at the top as constants.
  - Domain-specific overrides are managed via localStorage (see `STORAGE` object).
  - Blocking is performed by intercepting DOM APIs, network requests, and script injection.
  - UI panel and per-domain controls are feature-flagged and modularized within the script.

## Key Patterns & Conventions

- **ESLint enforced:** All code must pass linting (`npm run lint`). Use curly braces for all control blocks.
- **English only:** All code, comments, and variables are in English.
- **Atomic changes:** Only edit code directly relevant to the task. Do not refactor unrelated code in the same commit.
- **Immutability:** Prefer immutable data structures and pure functions where possible.
- **Error handling:** Never fail silently; log errors and use descriptive messages.
- **Configuration:** All feature toggles and runtime modes are defined as constants at the top of the script.
- **Overrides:** Per-domain settings are stored in localStorage with the prefix `PG_OVERRIDES::`.

## Developer Workflows

- **Build:** No build step required; edit `privacy-guard.user.js` directly and test in browser via userscript manager.
- **Lint:** Run `npm run lint` (uses ESLint, see config).
- **Test:** No formal test suite; manual testing in browser is required.
- **Debug:** Use browser devtools; feature toggles and logs are accessible via the script's UI panel (if enabled).

## Integration Points

- **localStorage:** Used for per-domain override settings.
- **DOM APIs:** Intercepts `createElement`, `MutationObserver`, and network APIs to block trackers.
- **UI Panel:** (If enabled) provides user controls for toggling features and viewing logs.

## Examples

- To add a new blocking rule, update the `BLOCKED_PATTERNS` array in `privacy-guard.user.js`.
- To add a new feature toggle, add to the `FEATURES` object at the top of the script.
- To persist new per-domain settings, extend the `STORAGE` object logic.

## References

- See `AGENTS.md` for full coding standards and philosophy.
- See userscript metadata block in `privacy-guard.user.js` for install/update URLs and support links.

---

If anything is unclear or missing, please ask for clarification or propose an update to this file.
