import { URLCleaner } from "./cleaner.js";

let shouldBlockImpl = () => false;

/**
 * Sets the predicate used to determine if a URL should be blocked.
 * Falls back to a no-op predicate when a non-function value is provided.
 * @param {((url: string) => boolean)=} fn - Predicate returning true when the URL must be blocked.
 */
export function setShouldBlock(fn) {
  if (typeof fn === "function") {
    shouldBlockImpl = fn;
    return;
  }
  shouldBlockImpl = () => false;
}

export const URLCleaningRuntime = {
  /**
   * Cleans up a srcset string by normalizing URLs.
   * @param {string} srcset - The srcset attribute value.
   * @returns {string} - The cleaned srcset attribute value.
   */
  cleanSrcset(srcset) {
    if (!srcset || typeof srcset !== "string") {
      return srcset;
    }
    try {
      return srcset
        .split(",")
        .map((part) => {
          const bits = part.trim().split(/\s+/);
          const url = bits[0];
          if (!url) {
            return part;
          }
          const cleaned = URLCleaner.cleanHref(url);
          bits[0] = cleaned;
          return bits.join(" ");
        })
        .join(", ");
    } catch {
      return srcset;
    }
  },

  hardenAnchor(a) {
    try {
      a.removeAttribute("ping");
    } catch {
      /* ignore */
    }
    try {
      const rel = (a.getAttribute("rel") || "").toLowerCase();
      const parts = new Set(rel.split(/\s+/).filter(Boolean));
      // Add noopener and noreferrer to prevent leaking referrer and window.opener
      parts.add("noopener");
      parts.add("noreferrer");
      a.setAttribute("rel", Array.from(parts).join(" "));
    } catch {
      /* ignore */
    }
  },

  maybeNeutralizeLinkEl(linkEl) {
    try {
      const relRaw = (linkEl.getAttribute("rel") || "").toLowerCase();
      const rels = new Set(relRaw.split(/\s+/).filter(Boolean));
      const TRACKING_RELS = new Set(["preconnect", "dns-prefetch", "prefetch", "prerender"]);
      let hasTrackingRel = false;
      for (const r of rels) {
        if (TRACKING_RELS.has(r)) {
          hasTrackingRel = true;
          break;
        }
      }
      if (!hasTrackingRel) {
        return;
      }
      const href = linkEl.getAttribute("href") || "";
      if (!href) {
        linkEl.remove();
        return;
      }
      // if it points to a blocked domain, remove it
      if (shouldBlockImpl(href)) {
        linkEl.remove();
        return;
      }
      // if not blocked, at least clean the href
      const cleaned = URLCleaner.cleanHref(href, linkEl.baseURI);
      if (cleaned !== href) {
        linkEl.setAttribute("href", cleaned);
      }
    } catch {
      /* ignore */
    }
  },

  // Rewrite a single element in-place if attribute exists
  rewriteElAttr(el, attr) {
    const val = el.getAttribute(attr);
    if (!val) {
      return;
    }

    // Skip if already processed to avoid redundant operations
    if (el.dataset.privacyGuardCleaned === "1") {
      return;
    }

    const cleaned = URLCleaner.cleanHref(val, el.baseURI);

    // Only modify if there's an actual change
    if (cleaned && cleaned !== val) {
      // Additional safety: preserve existing data attributes and classes
      const existingDataAttrs = {};
      const existingClasses = el.className;

      // Capture existing data-* attributes before modification
      for (const dataAttr of el.attributes) {
        if (dataAttr.name.startsWith("data-") && dataAttr.name !== "data-privacy-guard-cleaned") {
          existingDataAttrs[dataAttr.name] = dataAttr.value;
        }
      }

      // Apply the cleaned URL
      el.setAttribute(attr, cleaned);

      // Restore any data attributes that might have been affected
      Object.entries(existingDataAttrs).forEach(([name, value]) => {
        if (el.getAttribute(name) !== value) {
          el.setAttribute(name, value);
        }
      });

      // Restore classes if they were modified
      if (el.className !== existingClasses && existingClasses) {
        el.className = existingClasses;
      }

      // Mark as processed
      el.dataset.privacyGuardCleaned = "1";
    } else if (cleaned === val) {
      // Even if no change, mark as processed to avoid future checks
      el.dataset.privacyGuardCleaned = "1";
    }
  },

  // Initial and incremental sweeps
  sweep(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    // Only scan relevant elements
    root
      .querySelectorAll("a[href], img[src], img[srcset], form[action], link[rel][href]")
      .forEach((el) => {
        if (el.dataset.privacyGuardCleaned === "1") {
          return;
        }
        if (el.tagName === "A") {
          this.rewriteElAttr(el, "href");
          this.hardenAnchor(el);
        } else if (el.tagName === "IMG") {
          this.rewriteElAttr(el, "src");
          if (el.hasAttribute("srcset")) {
            const before = el.getAttribute("srcset") || "";
            const after = this.cleanSrcset(before);
            if (after !== before) {
              el.setAttribute("srcset", after);
            }
          }
        } else if (el.tagName === "FORM") {
          this.rewriteElAttr(el, "action");
        } else if (el.tagName === "LINK") {
          this.maybeNeutralizeLinkEl(el);
        }
      });
  },

  // Intercept clicks to ensure last-moment cleaning (covers dynamic href)
  interceptClicks() {
    document.addEventListener(
      "click",
      (e) => {
        const a = e.target && (e.target.closest ? e.target.closest("a[href]") : null);
        if (!a) {
          return;
        }
        this.rewriteElAttr(a, "href");
      },
      true, // capture to run before site handlers
    );
  },

  // Intercept context menu to clean links before user copies them
  interceptContextMenu() {
    document.addEventListener(
      "contextmenu",
      (e) => {
        const a = e.target && (e.target.closest ? e.target.closest("a[href]") : null);
        if (a) {
          this.rewriteElAttr(a, "href");
        }
      },
      true,
    );
  },

  // Intercept hover to clean links before user sees them
  interceptHover() {
    document.addEventListener(
      "mouseover",
      (e) => {
        const a = e.target && (e.target.closest ? e.target.closest("a[href]") : null);
        if (a) {
          this.rewriteElAttr(a, "href");
        }
      },
      true,
    );
  },

  // Patch history API to clean pushState/replaceState URLs (SPA)
  interceptHistory() {
    const patch = (m) => {
      const original = history[m];
      history[m] = function (state, title, url) {
        if (typeof url === "string") {
          url = URLCleaner.cleanHref(url);
        }
        return original.apply(this, [state, title, url]);
      };
    };
    patch("pushState");
    patch("replaceState");

    // Also react to popstate-driven navigations by sweeping DOM
    window.addEventListener("popstate", () => {
      this.sweep(document);
    });
  },

  // Observe added nodes; filter to relevant elements for performance
  observeMutations() {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n && n.nodeType === Node.ELEMENT_NODE) {
            // Clean the node itself if it is relevant
            if (
              n.matches &&
              n.matches("a[href],img[src],img[srcset],form[action],link[rel][href]")
            ) {
              this.sweep(n);
            } else {
              // Or scan its children (bounded)
              this.sweep(n);
            }
          }
        });
        if (m.type === "attributes" && m.target && m.target.nodeType === Node.ELEMENT_NODE) {
          const t = m.target;
          if (
            m.attributeName === "href" ||
            m.attributeName === "src" ||
            m.attributeName === "srcset" ||
            m.attributeName === "action" ||
            m.attributeName === "rel" ||
            m.attributeName === "ping"
          ) {
            this.sweep(t);
          }
        }
      }
    });

    obs.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "src", "srcset", "action", "rel", "ping"],
    });
  },

  // Intercept navigations triggered via JS APIs to ensure cleaned URLs
  interceptNavigation() {
    try {
      // window.open
      const _open = window.open;
      if (_open) {
        window.open = function (url, name, specs) {
          try {
            if (typeof url === "string") {
              url = URLCleaner.cleanHref(url);
            }
          } catch {
            /* ignore */
          }
          return _open.call(window, url, name, specs);
        };
      }
    } catch {
      /* ignore */
    }
    try {
      // location.assign / replace
      const locationPrototype = Object.getPrototypeOf(location);
      if (locationPrototype && locationPrototype.assign) {
        const _assign = locationPrototype.assign;
        locationPrototype.assign = function (url) {
          try {
            if (typeof url === "string") {
              url = URLCleaner.cleanHref(url);
            }
          } catch {
            /* ignore */
          }
          return _assign.call(this, url);
        };
      }
      if (locationPrototype && locationPrototype.replace) {
        const _replace = locationPrototype.replace;
        locationPrototype.replace = function (url) {
          try {
            if (typeof url === "string") {
              url = URLCleaner.cleanHref(url);
            }
          } catch {
            /* ignore */
          }
          return _replace.call(this, url);
        };
      }
    } catch {
      /* ignore */
    }
  },

  init() {
    // Initial sweep once DOM is ready enough
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.sweep(document));
    } else {
      this.sweep(document);
    }
    this.interceptClicks();
    this.interceptContextMenu();
    this.interceptHover();
    this.interceptHistory();
    this.observeMutations();
    this.interceptNavigation();
    // Final pass on full load (late-injected links)
    window.addEventListener("load", () => this.sweep(document));
  },
};
