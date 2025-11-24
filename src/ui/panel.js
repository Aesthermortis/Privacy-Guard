import { applyOverridesForHost, CONFIG, FEATURES, MODE } from "../config.js";
import { PrivacyGuard } from "../core/privacy-guard.js";
import { EventLog } from "../event-log.js";
import { STORAGE } from "../storage.js";
import { renderHTML } from "../utils/render-html.js";
import { injectCSS } from "./inject-css.js";
import { mountUI } from "./mount-ui.js";
import panelStyles from "./panel.css";
import switchStyles from "./styles/switch.css";
import { createChannelToggles } from "./widgets/ChannelToggles.js";
import { createFeatureToggles } from "./widgets/FeatureToggles.js";

/**
 * Finds an existing CSP nonce from the document so injected styles comply with strict CSPs.
 * @param {Document} doc Document to inspect.
 * @returns {string} Resolved nonce or empty string when not found.
 */
function detectCspNonce(doc = document) {
  const nonceSource = doc.querySelector('style[nonce],link[rel="stylesheet"][nonce],script[nonce]');
  if (!nonceSource) {
    return "";
  }
  return nonceSource.nonce || nonceSource.getAttribute("nonce") || "";
}

/**
 * Determines whether the received keyboard event matches the configured hotkey.
 * @param {KeyboardEvent} event Candidate keyboard event.
 * @param {{ctrl: boolean, shift: boolean, alt: boolean, key: string} | null} hk Hotkey definition to compare against.
 * @returns {boolean} True when the event satisfies all modifier and key requirements.
 */
function matchHotkey(event, hk) {
  if (!hk) {
    return false;
  }
  const key = (event.key || "").toLowerCase();
  return (
    !!event.ctrlKey === !!hk.ctrl &&
    !!event.shiftKey === !!hk.shift &&
    !!event.altKey === !!hk.alt &&
    key === (hk.key || "").toLowerCase()
  );
}

/**
 * Initializes the UI panel when the feature flag is enabled and wires global listeners
 * for hotkeys and navigation changes.
 * @returns {{show: () => void, hide: () => void, toggle: () => void, redraw: () => void} | null}
 * Returns the panel API when enabled, otherwise null.
 */
export function setupUIPanel() {
  if (!FEATURES.uiPanel) {
    return null;
  }

  const UIPanel = (() => {
    let host = null;
    let shadow = null;
    let refs = null;
    let visible = false;
    let cssApplied = false;
    let autoPersistenceAttached = false;
    let clickHandlerAttached = false;
    PrivacyGuard.loadChannelEnabled();
    PrivacyGuard.loadFeatureFlags();
    const channelToggles = createChannelToggles(PrivacyGuard);
    const featureToggles = createFeatureToggles(PrivacyGuard);

    /**
     * Ensures the Privacy Guard panel stylesheet is injected into the document.
     */
    function ensureCss() {
      if (!shadow || cssApplied) {
        return;
      }
      const nonce = detectCspNonce(document);
      const injectOptions = { gmFallback: true, nonce };
      injectCSS("pg-style", panelStyles, shadow, injectOptions);
      injectCSS("pg-switch-style", switchStyles, shadow, injectOptions);
      cssApplied = true;
    }

    /**
     * Escapes HTML special characters to prevent injection when rendering the panel log.
     * @param {unknown} value Value that may contain HTML-sensitive characters.
     * @returns {string} Escaped string safe to insert into HTML.
     */
    function escapeHtml(value) {
      if (value === null || value === undefined) {
        return "";
      }
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    /**
     * Computes the current panel state combining overrides and defaults.
     * @returns {{overridesEnabled: boolean, networkBlock: string, scriptBlockMode: string, allowSameOrigin: boolean, list: import("../event-log.js").EventLogEntry[]}}
     * State snapshot for the UI.
     */
    function getPanelState() {
      const overrides = STORAGE.get(location.hostname) || { enabled: true };
      const overridesEnabled = overrides.enabled !== false;
      const networkBlock = overrides.networkBlock || MODE.networkBlock;
      const scriptBlockMode = overrides.scriptBlockMode || CONFIG.scriptBlockMode;
      const allowSameOrigin = overrides.allowSameOrigin ?? CONFIG.allowSameOrigin;
      return {
        overridesEnabled,
        networkBlock,
        scriptBlockMode,
        allowSameOrigin,
        list: EventLog.list(),
      };
    }

    /**
     * Formats the configured hotkey into human readable text.
     * @param {{ctrl?: boolean, shift?: boolean, alt?: boolean, key?: string}} hk Hotkey descriptor.
     * @returns {string} Human readable hotkey.
     */
    function formatHotkey(hk) {
      const segments = [];
      if (hk.ctrl) {
        segments.push("Ctrl");
      }
      if (hk.shift) {
        segments.push("Shift");
      }
      if (hk.alt) {
        segments.push("Alt");
      }
      const key = (hk.key || "").trim();
      if (key) {
        segments.push(key.length === 1 ? key.toUpperCase() : key);
      }
      return segments.join("+") || "Ctrl+Shift+Q";
    }

    /**
     * Updates the hotkey helper label based on the active hotkey configuration.
     * @returns {void}
     */
    function updateHotkeyLabel() {
      if (!refs || !refs.hotkey) {
        return;
      }
      const activeHotkey = hotkey || DEFAULT_HOTKEY;
      refs.hotkey.textContent =
        "Changes save automatically - Hotkey: " + formatHotkey(activeHotkey);
    }

    /**
     * Updates static control state and metadata labels.
     * @param {ReturnType<typeof getPanelState>} state Latest panel state.
     * @returns {void}
     */
    function updateControls(state) {
      if (!refs) {
        return;
      }
      if (refs.hostname) {
        refs.hostname.textContent = location.hostname;
      }
      if (refs.network instanceof HTMLSelectElement) {
        refs.network.value = state.networkBlock;
        refs.network.disabled = !state.overridesEnabled;
      }
      if (refs.scriptMode instanceof HTMLSelectElement) {
        refs.scriptMode.value = state.scriptBlockMode;
        refs.scriptMode.disabled = !state.overridesEnabled;
      }
      if (refs.allowSameOrigin instanceof HTMLInputElement) {
        refs.allowSameOrigin.checked = state.allowSameOrigin;
        refs.allowSameOrigin.disabled = !state.overridesEnabled;
      }
      if (refs.enableOverrides instanceof HTMLInputElement) {
        refs.enableOverrides.checked = state.overridesEnabled;
      }
      updateHotkeyLabel();
    }

    /**
     * Renders the event log entries into the panel.
     * @param {import("../event-log.js").EventLogEntry[]} entries Event list.
     * @returns {void}
     */
    function updateLog(entries) {
      if (!refs) {
        return;
      }
      if (refs.logCount) {
        refs.logCount.textContent = String(entries.length);
      }
      if (!refs.logContainer) {
        return;
      }
      const markup = entries
        .slice(0, 25)
        .map((event) => {
          const kind = escapeHtml(event.kind);
          const time = new Date(event.time).toLocaleTimeString();
          const url = escapeHtml(event.url);
          return (
            '<div class="pg-log-item"><b>' +
            kind +
            '</b> <span class="pg-muted">' +
            time +
            "</span><div>" +
            url +
            "</div></div>"
          );
        })
        .join("");
      const html = markup || '<div class="pg-muted">No recent blocks</div>';
      renderHTML(refs.logContainer, html);
    }

    /**
     * Ensures interactive toggles are mounted inside the shadow root.
     * @returns {void}
     */
    function installToggles() {
      if (!refs) {
        return;
      }
      if (refs.switches) {
        refs.switches.replaceChildren(channelToggles.element);
        channelToggles.syncFromState();
      }
      if (refs.features) {
        refs.features.replaceChildren(featureToggles.element);
        featureToggles.syncFromState();
      }
    }

    /**
     * Reads the current override selections from the rendered panel.
     * @param {HTMLElement} panelRoot Panel container element.
     * @returns {{enabled: boolean, networkBlock: string, scriptBlockMode: string, allowSameOrigin: boolean}}
     * Collected override values.
     */
    function collectOverridesFromDom(panelRoot) {
      const nb = panelRoot.querySelector("[data-pg-network]");
      const sbm = panelRoot.querySelector("[data-pg-script-mode]");
      const enabled = panelRoot.querySelector("[data-pg-enable]");
      const aso = panelRoot.querySelector("[data-pg-allow-so]");
      return {
        enabled: Boolean(enabled && enabled.checked),
        networkBlock: nb && nb.value ? nb.value : MODE.networkBlock,
        scriptBlockMode: sbm && sbm.value ? sbm.value : CONFIG.scriptBlockMode,
        allowSameOrigin: Boolean(aso && aso.checked),
      };
    }

    /**
     * Wires automatic persistence for override controls so changes apply instantly.
     * @param {HTMLElement} panelRoot Panel container element.
     * @returns {void}
     */
    function installAutoPersistence(panelRoot) {
      const controls = [
        panelRoot.querySelector("[data-pg-network]"),
        panelRoot.querySelector("[data-pg-script-mode]"),
        panelRoot.querySelector("[data-pg-allow-so]"),
        panelRoot.querySelector("[data-pg-enable]"),
      ].filter(Boolean);

      if (controls.length === 0) {
        return;
      }

      const apply = () => {
        persistOverrides(panelRoot);
      };

      for (const control of controls) {
        control.addEventListener("change", apply);
      }
    }

    /**
     * Persists the collected overrides for the active hostname and refreshes the UI.
     * @param {HTMLElement} panelRoot Panel container element.
     * @returns {void}
     */
    function persistOverrides(panelRoot) {
      const next = collectOverridesFromDom(panelRoot);
      STORAGE.set(location.hostname, next);
      applyOverridesForHost(location.hostname, STORAGE);
      redraw();
    }

    /**
     * Resets host overrides and refreshes the UI.
     * @returns {void}
     */
    function resetOverrides() {
      STORAGE.remove(location.hostname);
      applyOverridesForHost(location.hostname, STORAGE);
      redraw();
    }

    /**
     * Creates a delegated click handler for panel actions.
     * @returns {(event: MouseEvent) => void} Handler responding to action buttons.
     */
    function createPanelClickHandler() {
      const actionHandlers = new Map([
        ["close", () => hide()],
        ["reset", () => resetOverrides()],
      ]);

      return (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionable = target.closest("[data-pg-action]");
        if (!actionable) {
          return;
        }
        const action = actionable.dataset.pgAction;
        const handler = action && actionHandlers.get(action);
        if (handler) {
          handler();
        }
      };
    }

    /**
     * Creates the panel host element (or reuses it) and binds interaction handlers.
     * @returns {void}
     */
    function mount() {
      const mounted = mountUI();
      host = mounted.host;
      shadow = mounted.shadow;
      refs = mounted.refs;

      ensureCss();

      if (refs.root && !clickHandlerAttached) {
        refs.root.addEventListener("click", createPanelClickHandler());
        clickHandlerAttached = true;
      }

      if (refs.root && !autoPersistenceAttached) {
        installAutoPersistence(refs.root);
        autoPersistenceAttached = true;
      }
    }

    /**
     * Regenerates the panel markup using the latest state values.
     * @returns {void}
     */
    function redraw() {
      if (!shadow || !refs || !refs.root) {
        return;
      }
      ensureCss();
      const state = getPanelState();
      updateControls(state);
      installToggles();
      updateLog(state.list);
    }

    /**
     * Displays the panel, creating it if necessary, and refreshes its contents.
     * @returns {void}
     */
    function show() {
      mount();
      if (!host) {
        return;
      }
      host.style.display = "block";
      visible = true;
      redraw();
    }

    /**
     * Hides the panel without tearing down the underlying DOM nodes.
     * @returns {void}
     */
    function hide() {
      if (!host) {
        return;
      }
      host.style.display = "none";
      visible = false;
    }

    /**
     * Toggles the panel visibility based on the current display state.
     * @returns {void}
     */
    function toggle() {
      if (visible) {
        hide();
      } else {
        show();
      }
    }

    return { show, hide, toggle, redraw };
  })();

  const DEFAULT_HOTKEY = { ctrl: true, shift: true, alt: false, key: "q" }; // Ctrl+Shift+Q
  const hotkey = null; // custom hotkey object or null for default

  globalThis.addEventListener(
    "keydown",
    (event) => {
      try {
        const active = document.activeElement;
        const inEdit =
          active &&
          (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
        if (inEdit) {
          return;
        }
        if (matchHotkey(event, hotkey || DEFAULT_HOTKEY)) {
          event.preventDefault();
          event.stopPropagation();
          UIPanel.toggle();
        }
      } catch {
        /* ignore */
      }
    },
    true,
  );

  globalThis.addEventListener("popstate", () => UIPanel.redraw());
  globalThis.addEventListener("hashchange", () => UIPanel.redraw());

  return UIPanel;
}
