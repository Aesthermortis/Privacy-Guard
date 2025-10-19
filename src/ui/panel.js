import { applyOverridesForHost, CONFIG, FEATURES, MODE } from "../config.js";
import { PrivacyGuard } from "../core/privacy-guard.js";
import { EventLog } from "../event-log.js";
import { STORAGE } from "../storage.js";
import { injectCSS } from "./inject-css.js";
import panelStyles from "./panel.css";
import switchStyles from "./styles/switch.css";
import { createChannelToggles } from "./widgets/ChannelToggles.js";
import { createFeatureToggles } from "./widgets/FeatureToggles.js";

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
    let root = null;
    let visible = false;
    PrivacyGuard.loadChannelEnabled();
    PrivacyGuard.loadFeatureFlags();
    const channelToggles = createChannelToggles(PrivacyGuard);
    const featureToggles = createFeatureToggles(PrivacyGuard);

    /**
     * Ensures the Privacy Guard panel stylesheet is injected into the document.
     */
    function ensureCss() {
      injectCSS("pg-style", panelStyles);
      injectCSS("pg-switch-style", switchStyles);
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
     * Builds the panel HTML using host overrides, global defaults, and recent event log entries.
     * @returns {string} HTML markup representing the current state of the Privacy Guard panel.
     */
    function view() {
      const overrides = STORAGE.get(location.hostname) || { enabled: true };
      const overridesEnabled = overrides.enabled !== false;
      const disabledAttr = overridesEnabled ? "" : "disabled";
      const networkBlock = overrides.networkBlock || MODE.networkBlock;
      const scriptBlockMode = overrides.scriptBlockMode || CONFIG.scriptBlockMode;
      const allowSameOrigin = overrides.allowSameOrigin ?? CONFIG.allowSameOrigin;
      const list = EventLog.list();
      const html = `
          <div class="pg-row"><span class="pg-title">Privacy Guard</span><span class="pg-chip">${
            location.hostname
          }</span><button type="button" class="pg-btn pg-close pg-right" title="Close" data-pg-action="close">❌</button></div>
          <div class="pg-kv"><div>Network block</div>
            <div>
              <select class="pg-input pg-nb" ${disabledAttr}>
                <option value="fail" ${
                  networkBlock === "fail" ? "selected" : ""
                }>fail (emulate network error)</option>
                <option value="silent" ${
                  networkBlock === "silent" ? "selected" : ""
                }>silent (204 no content)</option>
              </select>
            </div>
          </div>
          <div class="pg-kv pg-network-toggles"><div>Channels</div>
            <div class="pg-switch-help">Per site (this domain only)</div>
            <div class="pg-switch-mount"></div>
          </div>
          <div class="pg-kv pg-feature-toggles"><div>Protections</div>
            <div class="pg-switch-help">Per site (this domain only)</div>
            <div class="pg-feature-switch-mount"></div>
          </div>
          <div class="pg-kv"><div>Script mode</div>
            <div>
              <select class="pg-input pg-sbm" ${disabledAttr}>
                <option value="createElement" ${
                  scriptBlockMode === "createElement" ? "selected" : ""
                }>createElement (strict)</option>
                <option value="observer" ${
                  scriptBlockMode === "observer" ? "selected" : ""
                }>observer (conservative)</option>
              </select>
            </div>
          </div>
          <div class="pg-row"><label><input type="checkbox" class="pg-aso" ${
            allowSameOrigin ? "checked" : ""
          } ${disabledAttr}/> Allow same-origin scripts</label><span class="pg-muted pg-right">Reduces privacy</span></div>
          <div class="pg-row"><label><input type="checkbox" class="pg-enable" ${
            overrides.enabled === false ? "" : "checked"
          }/> Enable overrides for this domain</label></div>
          <div class="pg-row"><button type="button" class="pg-btn pg-reset" data-pg-action="reset">Reset</button><span class="pg-muted pg-right">Changes save automatically · Hotkey: Ctrl+Shift+Q</span></div>
          <div class="pg-log">
            <div class="pg-row"><span class="pg-title">Recent blocks</span><span class="pg-muted pg-right">${
              list.length
            }</span></div>
            ${list
              .slice(0, 25)
              .map((event) => {
                const kind = escapeHtml(event.kind);
                const time = new Date(event.time).toLocaleTimeString();
                const url = escapeHtml(event.url);
                return `<div class="pg-log-item"><b>${kind}</b> <span class="pg-muted">${time}</span><div>${url}</div></div>`;
              })
              .join("")}
          </div>
        `;
      return html;
    }

    /**
     * Reads the current override selections from the rendered panel.
     * @param {HTMLElement} panelRoot Panel container element.
     * @returns {{enabled: boolean, networkBlock: string, scriptBlockMode: string, allowSameOrigin: boolean}}
     * Collected override values.
     */
    function collectOverridesFromDom(panelRoot) {
      const nb = panelRoot.querySelector(".pg-nb");
      const sbm = panelRoot.querySelector(".pg-sbm");
      const enabled = panelRoot.querySelector(".pg-enable");
      const aso = panelRoot.querySelector(".pg-aso");
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
        panelRoot.querySelector(".pg-nb"),
        panelRoot.querySelector(".pg-sbm"),
        panelRoot.querySelector(".pg-aso"),
        panelRoot.querySelector(".pg-enable"),
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
     * Creates the panel host element and binds interaction handlers on first invocation.
     * @returns {void}
     */
    function mount() {
      if (root) {
        return;
      }
      ensureCss();
      root = document.createElement("div");
      root.className = "pg-panel";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", "Privacy Guard Panel");
      document.documentElement.append(root);
      redraw();
      root.addEventListener("click", createPanelClickHandler());
    }

    /**
     * Regenerates the panel markup using the latest state values.
     * @returns {void}
     */
    function redraw() {
      if (!root) {
        return;
      }
      root.innerHTML = view();
      installAutoPersistence(root);
      const mount = root.querySelector(".pg-switch-mount");
      if (mount) {
        mount.textContent = "";
        mount.append(channelToggles.element);
        channelToggles.syncFromState();
      }
      const featureMount = root.querySelector(".pg-feature-switch-mount");
      if (featureMount) {
        featureMount.textContent = "";
        featureMount.append(featureToggles.element);
        featureToggles.syncFromState();
      }
    }

    /**
     * Displays the panel, creating it if necessary, and refreshes its contents.
     * @returns {void}
     */
    function show() {
      if (!root) {
        mount();
      }
      if (!root) {
        return;
      }
      root.style.display = "block";
      visible = true;
      redraw();
    }

    /**
     * Hides the panel without tearing down the underlying DOM nodes.
     * @returns {void}
     */
    function hide() {
      if (!root) {
        return;
      }
      root.style.display = "none";
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
