import { renderHTML } from "../utils/render-html.js";
import panelHtml from "./panel.html";

const HOST_ID = "pg-host";

/**
 * Collects frequently accessed DOM references from the panel shadow root.
 * @param {ShadowRoot} shadow Shadow root containing the panel markup.
 * @returns {Record<string, Element | null>} Gathered DOM nodes.
 */
function collectRefs(shadow) {
  return {
    root: shadow.querySelector("[data-pg-root]"),
    switches: shadow.querySelector("[data-pg-switches]"),
    features: shadow.querySelector("[data-pg-feature-switches]"),
    hostname: shadow.querySelector("[data-pg-hostname]"),
    network: shadow.querySelector("[data-pg-network]"),
    scriptMode: shadow.querySelector("[data-pg-script-mode]"),
    allowSameOrigin: shadow.querySelector("[data-pg-allow-so]"),
    enableOverrides: shadow.querySelector("[data-pg-enable]"),
    logContainer: shadow.querySelector("[data-pg-log]"),
    logCount: shadow.querySelector("[data-pg-log-count]"),
    hotkey: shadow.querySelector("[data-pg-hotkey]"),
  };
}

/**
 * Mounts the Privacy Guard panel inside a Shadow DOM, ensuring idempotency.
 * @returns {{ host: HTMLElement, shadow: ShadowRoot, refs: ReturnType<typeof collectRefs> }} Host node, shadow root, and cached references.
 */
export function mountUI() {
  /** @type {HTMLElement | null} */
  let host = /** @type {HTMLElement | null} */ (document.querySelector(`#${HOST_ID}`));
  if (host) {
    const shadow = host.shadowRoot;
    if (!shadow) {
      throw new Error("Existing Privacy Guard host lacks a shadow root.");
    }
    return { host, shadow, refs: collectRefs(shadow) };
  }

  host = document.createElement("div");
  host.id = HOST_ID;
  host.style.all = "initial";
  host.style.display = "none";

  const shadow = host.attachShadow({ mode: "open" });
  renderHTML(shadow, panelHtml);

  document.documentElement.append(host);

  return { host, shadow, refs: collectRefs(shadow) };
}
