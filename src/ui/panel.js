import panelStyles from "./panel.css";
import { injectCSS } from "./inject-css.js";
import { STORAGE } from "../storage.js";
import { MODE, CONFIG, FEATURES, applyOverridesForHost } from "../config.js";
import { EventLog } from "../event-log.js";

export function setupUIPanel() {
  if (!FEATURES.uiPanel) {
    return null;
  }

  const UIPanel = (() => {
    let root = null;
    let visible = false;

    function ensureCss() {
      injectCSS("pg-style", panelStyles);
    }

    function view() {
      const overrides = STORAGE.get(location.hostname) || { enabled: true };
      const networkBlock = overrides.networkBlock || MODE.networkBlock;
      const scriptBlockMode = overrides.scriptBlockMode || CONFIG.scriptBlockMode;
      const list = EventLog.list();
      const html = `
          <div class="pg-row"><span class="pg-title">Privacy Guard</span><span class="pg-chip">${
            location.hostname
          }</span><button class="pg-btn pg-close pg-right" title="Close">❌</button></div>
          <div class="pg-kv"><div>Network block</div>
            <div>
              <select class="pg-input pg-nb">
                <option value="fail" ${
                  networkBlock === "fail" ? "selected" : ""
                }>fail (emulate network error)</option>
                <option value="silent" ${
                  networkBlock === "silent" ? "selected" : ""
                }>silent (204 no content)</option>
              </select>
            </div>
          </div>
          <div class="pg-kv"><div>Script mode</div>
            <div>
              <select class="pg-input pg-sbm">
                <option value="createElement" ${
                  scriptBlockMode === "createElement" ? "selected" : ""
                }>createElement (strict)</option>
                <option value="observer" ${
                  scriptBlockMode === "observer" ? "selected" : ""
                }>observer (conservative)</option>
              </select>
            </div>
          </div>
          <div class="pg-row"><label><input type="checkbox" class="pg-enable" ${
            overrides.enabled !== false ? "checked" : ""
          }/> Enable overrides for this domain</label></div>
          <div class="pg-row"><button class="pg-btn pg-save">Save</button><button class="pg-btn pg-reset">Reset</button><span class="pg-muted pg-right">Hotkey: Ctrl+Shift+Q</span></div>
          <div class="pg-log">
            <div class="pg-row"><span class="pg-title">Recent blocks</span><span class="pg-muted pg-right">${
              list.length
            }</span></div>
            ${list
              .slice(0, 25)
              .map(
                (e) =>
                  `<div class="pg-log-item"><b>${e.kind}</b> <span class="pg-muted">${new Date(
                    e.time,
                  ).toLocaleTimeString()}</span><div>${e.url || ""}</div></div>`,
              )
              .join("")}
          </div>
        `;
      return html;
    }

    function mount() {
      if (root) {
        return;
      }
      ensureCss();
      root = document.createElement("div");
      root.className = "pg-panel";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", "Privacy Guard Panel");
      document.documentElement.appendChild(root);
      redraw();
      root.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.classList.contains("pg-close")) {
          hide();
          return;
        }
        if (target.classList.contains("pg-save")) {
          const nb = root.querySelector(".pg-nb");
          const sbm = root.querySelector(".pg-sbm");
          const enabled = root.querySelector(".pg-enable");
          const next = {
            enabled: enabled && enabled.checked ? true : false,
            networkBlock: nb && nb.value ? nb.value : MODE.networkBlock,
            scriptBlockMode: sbm && sbm.value ? sbm.value : CONFIG.scriptBlockMode,
          };
          STORAGE.set(location.hostname, next);
          applyOverridesForHost(location.hostname, STORAGE);
          redraw();
          return;
        }
        if (target.classList.contains("pg-reset")) {
          STORAGE.remove(location.hostname);
          applyOverridesForHost(location.hostname, STORAGE);
          redraw();
        }
      });
    }

    function redraw() {
      if (!root) {
        return;
      }
      root.innerHTML = view();
    }

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

    function hide() {
      if (!root) {
        return;
      }
      root.style.display = "none";
      visible = false;
    }

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

  window.addEventListener(
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

  window.addEventListener("popstate", () => UIPanel.redraw());
  window.addEventListener("hashchange", () => UIPanel.redraw());

  return UIPanel;
}
