// ==UserScript==
// @name         Privacy Guard
// @namespace    com.aesthermortis.privacy-guard
// @version      1.3.0
// @description  A UserScript to enhance privacy by blocking trackers and analytics.
// @author       Aesthermortis
// @match        *://*/*
// @icon         data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path fill='%231D4ED8' d='M32 6c8 4 16 4 20 6v16c0 12-8 22-20 30C20 50 12 40 12 28V12c4-2 12-2 20-6z'/><rect x='22' y='28' width='20' height='16' rx='3' fill='white' opacity='0.95'/><path d='M25 28v-3a7 7 0 0114 0v3' stroke='%230F172A' stroke-width='3' fill='none'/><circle cx='32' cy='36' r='3' fill='%230F172A'/><rect x='31' y='39' width='2' height='4' rx='1' fill='%230F172A'/></svg>
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://github.com/Aesthermortis/privacy-guard/releases/latest/download/privacy-guard.user.js
// @updateURL    https://github.com/Aesthermortis/privacy-guard/releases/latest/download/privacy-guard.user.js
// @supportURL   https://github.com/Aesthermortis/privacy-guard/issues
// @homepageURL  https://github.com/Aesthermortis/privacy-guard
// ==/UserScript==
(function () {
  "use strict";

  // --- Configuration ---

  /**
   * A unified list of domain and URL patterns to block.
   * This list is used for iframes, network requests (fetch, XHR), and scripts.
   * @type {string[]}
   */
  const BLOCKED_PATTERNS = [
    // Google
    "doubleclick.net",
    "adservice.google.com",
    "google-analytics.com",
    "googletagmanager.com",
    "googlesyndication.com",
    "imasdk.googleapis.com",
    // Facebook
    "facebook.com/plugins",
    "facebook.com/v", // Covers /vXX.X/
    // Github
    "collector.github.com",
    "api.github.com/_private/browser/stats",
    // ChatGPT
    "chatgpt.com/ces/",
    // Other common trackers
    "overbridgenet.com/jsv8/offer",
    // Add more patterns here
  ];

  /**
   * A list of domains that should never be blocked.
   * This acts as a whitelist to prevent breaking essential site functionality.
   * @type {string[]}
   */
  const ALLOWED_PATTERNS = [
    // Add trusted domains here
  ];

  /**
   * Allowed URL schemes that should never be blocked.
   * This prevents blocking internal browser URLs and data URIs.
   * @type {string[]}
   */
  const ALLOWED_SCHEMES = [
    "blob:",
    "data:",
    "chrome-extension:",
    "about:", // about:blank
    "moz-extension:", // Firefox
    "safari-extension:", // Safari
  ];

  /**
   * Runtime mode toggles.
   * - networkBlock: "fail" emulates a real network failure (recommended to avoid spinners).
   *                  "silent" returns empty 204 responses (may break some UIs).
   */
  const MODE = {
    networkBlock: "fail", // "fail" | "silent"
  };

  // Script blocking strategy:
  // - "createElement": maximum coverage (intercepts .src before execution)
  // - "observer": conservative; neutralizes after insertion
  const CONFIG = {
    scriptBlockMode: "createElement", // "createElement" | "observer"
  };

  /**
   * Main object to encapsulate all logic.
   */
  const PrivacyGuard = {
    /**
     * Checks if a given URL or src attribute matches any blocked pattern.
     * @param {string | null | undefined} url - The URL or src to check.
     * @returns {boolean} - True if the URL should be blocked.
     */
    shouldBlock(url) {
      if (!url) {
        return false;
      }

      // Convert to string to handle URL objects
      const urlString = String(url);

      // Do not block internal/browser schemes
      for (const scheme of ALLOWED_SCHEMES) {
        if (urlString.startsWith(scheme)) {
          return false;
        }
      }

      // Never block the current origin (same host)
      try {
        const u = new URL(urlString, location.href);
        if (u.hostname === location.hostname) {
          return false;
        }
      } catch (_) {
        /* ignore */
      }

      // Whitelist check: if the URL matches an allowed pattern, do not block it.
      if (ALLOWED_PATTERNS.some((pattern) => urlString.includes(pattern))) {
        return false;
      }

      // Blacklist check: block if it matches a blocked pattern.
      return BLOCKED_PATTERNS.some((pattern) => urlString.includes(pattern));
    },

    /**
     * Removes a node from the DOM and logs the action.
     * @param {Node} node - The DOM node to remove.
     * @param {string} reason - The reason for removal (e.g., 'iframe', 'script').
     */
    removeNode(node, reason) {
      node.remove();
      console.debug(`[Privacy Guard] Blocked and removed ${reason}:`, node.src || "");
    },

    /**
     * Intercepts the creation of script elements to block them before they are
     * added to the DOM, preventing execution entirely. This is the most effective
     * method against dynamically injected scripts.
     */
    interceptElementCreation() {
      const originalCreateElement = document.createElement;
      const self = this;

      document.createElement = function (...args) {
        const element = originalCreateElement.apply(this, args);
        const tagName = args[0]?.toLowerCase();

        if (tagName === "script") {
          Object.defineProperty(element, "src", {
            configurable: true,
            enumerable: true,
            set(value) {
              if (self.shouldBlock(value)) {
                console.debug("[Privacy Guard] Prevented script creation:", value);
                // Set a non-executable type to neutralize the script
                element.setAttribute("type", "text/plain");
              }
              // Set the original value (or let it be handled by the neutralized type)
              element.setAttribute("src", value);
            },
            get() {
              return element.getAttribute("src");
            },
          });
        }
        return element;
      };
    },

    /**
     * Neutralize a <script> element safely (prevents execution).
     */
    neutralizeScript(el) {
      try {
        el.type = "text/plain";
      } catch (_) {}
      try {
        el.removeAttribute("nonce");
      } catch (_) {}
      try {
        this.removeNode(el, "script");
      } catch (_) {}
    },

    /**
     * Scans a node and its children for elements to block (iframes, scripts).
     * @param {Node} node - The root node to scan.
     */
    scanNodeForBlockedElements(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      // Block iframes
      if (node.tagName === "IFRAME" && this.shouldBlock(node.src)) {
        this.removeNode(node, "iframe");
        return; // Node is removed, no need to check its children
      }

      // Block scripts
      if (node.tagName === "SCRIPT" && this.shouldBlock(node.src)) {
        this.neutralizeScript(node);
        return;
      }

      // Scan children of the node
      const elements = node.querySelectorAll("iframe[src], script[src]");
      elements.forEach((el) => {
        if (this.shouldBlock(el.src)) {
          if (el.tagName === "SCRIPT") {
            this.neutralizeScript(el);
          } else {
            this.removeNode(el, el.tagName.toLowerCase());
          }
        }
      });
    },

    /**
     * Sets up a MutationObserver to watch for dynamically added nodes.
     * Starts as early as possible.
     */
    observeDOMChanges() {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (node && node.nodeType === Node.ELEMENT_NODE && node.tagName === "SCRIPT") {
              const src = node.getAttribute("src") || "";
              if (this.shouldBlock(src)) {
                // Try to neutralize before execution
                this.neutralizeScript(node);
                return;
              }
            }
            this.scanNodeForBlockedElements(node);
          });
        }
      });

      // Observe as early as possible
      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
      });
    },

    /**
     * Intercepts `fetch` requests to block trackers.
     */
    interceptFetch() {
      // IMPORTANT: bind original fetch to window to avoid "Illegal invocation"
      const originalFetch = window.fetch.bind(window);
      // Use a normal function to keep a callable with a proper [[ThisMode]]
      window.fetch = function (...args) {
        const [input] = args;
        const url = typeof input === "string" ? input : input?.url || "";

        if (PrivacyGuard.shouldBlock(url)) {
          console.debug("[Privacy Guard] Blocked fetch:", url);
          if (MODE.networkBlock === "silent") {
            // Previous behavior (NOT recommended): may leave UIs in loading state.
            return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
          } else {
            // Emulate real network failure. Many apps already handle this case gracefully.
            return Promise.reject(new TypeError("PrivacyGuard blocked: " + url));
          }
        }

        return originalFetch(...args);
      };
    },

    /**
     * Intercepts `navigator.sendBeacon` calls.
     */
    interceptBeacon() {
      const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
      if (!originalSendBeacon) {
        return;
      }

      navigator.sendBeacon = (url, data) => {
        if (this.shouldBlock(url)) {
          console.debug("[Privacy Guard] Blocked beacon:", url);
          // Indicate failure so sites don't assume it worked.
          return false;
        }
        return originalSendBeacon(url, data);
      };
    },

    /**
     * Intercepts `XMLHttpRequest` to block requests.
     * This overrides `send` for a safer interception.
     */
    interceptXHR() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const self = this; // Reference to PrivacyGuard object

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        // Store the URL on the instance for `send` to check it.
        this._privacyGuardUrl = url;
        originalOpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function (...args) {
        if (this._privacyGuardUrl && self.shouldBlock(String(this._privacyGuardUrl))) {
          console.debug("[Privacy Guard] Blocked XHR:", this._privacyGuardUrl);
          // Emulate real network failure: dispatch 'error' and 'abort', then 'loadend'
          Promise.resolve().then(() => {
            try {
              this.dispatchEvent(new ProgressEvent("error"));
            } catch (_) {}
            try {
              this.dispatchEvent(new ProgressEvent("abort"));
            } catch (_) {}
            try {
              this.dispatchEvent(new Event("loadend"));
            } catch (_) {}
          });
          return;
        }
        originalSend.apply(this, args);
      };
    },

    /**
     * Initializes all privacy-enhancing features.
     */
    init() {
      // Script interception (strategy selectable)
      if (CONFIG.scriptBlockMode === "createElement") {
        this.interceptElementCreation();
      }

      // Start observing DOM immediately
      this.observeDOMChanges();

      // Network interceptions
      this.interceptFetch();
      this.interceptBeacon();
      this.interceptXHR();

      // Enable URL cleaning runtime
      URLCleaningRuntime.init();

      // One full scan when the page is stable
      window.addEventListener("load", () =>
        this.scanNodeForBlockedElements(document.documentElement),
      );
    },
  };

  /**
   * --- URL Cleaning Module ----------------------------------------------------
   * Strips tracking params, resolves redirectors, and canonicalizes known sites.
   * Includes Amazon rules with safety guards for auth/checkout.
   */
  const URLCleaner = {
    // Global param blacklist (lowercased compare)
    GLOBAL_STRIP: new Set([
      // Common marketing
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "utm_name",
      "utm_reader",
      "utm_brand",
      "utm_social",
      "utm_viz_id",
      // Ad/attribution
      "gclid",
      "dclid",
      "msclkid",
      "fbclid",
      "twclid",
      "igshid",
      "vero_id",
      "mc_eid",
      "spm",
      "sc_cid",
      "s_cid",
      "pk_campaign",
      "pk_kwd",
      // Misc
      "referrer",
      "ref_src",
      "ref_url",
      "source",
      "cmp",
      "campaign",
      "adid",
      "ad",
      "cid",
      // Extra noise seen in the wild
      "_hsenc",
      "_hsmi",
      "oly_anon_id",
      "oly_enc_id",
      "mkt_tok",
      "algo_pvid",
      "algo_exp_id",
    ]),

    // Redirector patterns: extract ?u= or ?url= etc.
    REDIRECTORS: [
      { hostIncludes: "l.facebook.com", param: ["u", "url"] },
      { hostIncludes: "lm.facebook.com", param: ["u", "url"] },
      { hostIncludes: "out.reddit.com", param: ["url"] },
      { hostIncludes: "t.co", param: ["url"] },
      { hostIncludes: "google.com", pathHas: "/url", param: ["q", "url", "u"] },
      { hostIncludes: "news.google", pathHas: "/articles", param: ["url"] },
    ],

    // Domain-specific rules (lower priority than redirect resolution)
    byDomain(u) {
      const host = u.hostname.toLowerCase();

      // AMAZON: canonicalize to /dp/ASIN and strip noisy params.
      if (
        host.endsWith(".amazon.com") ||
        host.endsWith(".amazon.co.uk") ||
        host.endsWith(".amazon.de") ||
        host.endsWith(".amazon.fr") ||
        host.endsWith(".amazon.es") ||
        host.endsWith(".amazon.it") ||
        host.endsWith(".amazon.ca") ||
        host.endsWith(".amazon.com.mx") ||
        host.endsWith(".amazon.co.jp") ||
        host === "amazon.com"
      ) {
        this.cleanAmazon(u);
      }
    },

    // Conservative Amazon cleaner
    cleanAmazon(u) {
      // Avoid touching auth, payment, cart, and digital endpoints
      const p = u.pathname;
      if (
        p.startsWith("/ap/") || // auth
        p.startsWith("/gp/buy/") || // checkout
        p.startsWith("/cart/") || // cart
        p.startsWith("/hz/") || // internal flows
        p.startsWith("/gp/video/") || // prime video
        p.startsWith("/sspa/") // sponsored flows
      ) {
        return;
      }

      // Extract ASIN if present, then canonicalize
      // Matches /dp/<ASIN> or /gp/product/<ASIN> or /gp/aw/d/<ASIN>
      const asinMatch =
        p.match(/\/dp\/([A-Z0-9]{10})/i) ||
        p.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
        p.match(/\/gp\/aw\/d\/([A-Z0-9]{10})/i);

      if (asinMatch) {
        const asin = asinMatch[1].toUpperCase();
        u.pathname = `/dp/${asin}`;
        // For canonical product URLs, aggressively remove ALL query parameters.
        // No parameters are needed for the page to load correctly.
        u.search = "";
        u.hash = "";
        return;
      }

      // For general Amazon links (search, lists), strip marketing trash
      // but preserve essential search intent.
      const allowed = new Set([
        // keep only intent parameters for search/browse
        "k", // search keywords
        "rh", // filters
        "bbn", // browse node
        "i", // department
        "node", // node
      ]);
      this.stripParams(u, allowed, /* preserveCase*/ false);
    },

    // Remove tracking params globally, preserving an allowlist if provided
    stripParams(u, allowlist = new Set(), preserveCase = false) {
      const params = u.searchParams;
      // Build list to delete to avoid mutating while iterating
      const toDelete = [];
      for (const [k, v] of params.entries()) {
        const keyLC = k.toLowerCase();
        const inAllow = preserveCase ? allowlist.has(k) : allowlist.has(keyLC);
        if (!inAllow && (this.GLOBAL_STRIP.has(keyLC) || keyLC.startsWith("utm_"))) {
          toDelete.push(k);
          continue;
        }
        // kill empty params and Amazon noise
        if (
          !inAllow &&
          (v === "" ||
            keyLC === "ref" ||
            keyLC === "ref_src" ||
            keyLC === "ref_url" ||
            keyLC.startsWith("ref_") || // <- ref_*
            keyLC === "_encoding" || // <- _encoding
            keyLC.startsWith("pf_rd_") || // <- placements
            keyLC.startsWith("pd_rd_") || // <- placements
            keyLC === "content-id") // <- content block id
        ) {
          toDelete.push(k);
          continue;
        }
      }
      for (const k of toDelete) {
        params.delete(k);
      }
      // Remove trailing "ref" segments from path e.g., /dp/ASIN/ref=something
      u.pathname = u.pathname.replace(/\/ref=[^/]+$/i, "");
      // Drop dangling '?' if nothing remains
      if ([...u.searchParams.keys()].length === 0) {
        u.search = "";
      }
    },

    // Resolve known redirectors: if ?u= or ?url= present, replace with inner URL
    resolveRedirector(u) {
      const host = u.hostname.toLowerCase();
      const path = u.pathname;
      for (const r of this.REDIRECTORS) {
        if (host.includes(r.hostIncludes) && (!r.pathHas || path.includes(r.pathHas))) {
          for (const name of r.param) {
            const target = u.searchParams.get(name);
            if (target) {
              try {
                return new URL(target);
              } catch (_) {
                // sometimes the value is encoded twice
                try {
                  return new URL(decodeURIComponent(target));
                } catch (_) {}
              }
            }
          }
        }
      }
      return null;
    },

    // Normalize (lowercase host, remove default ports, collapse duplicate encoding)
    normalize(u) {
      u.hostname = u.hostname.toLowerCase();
      if (
        (u.protocol === "http:" && u.port === "80") ||
        (u.protocol === "https:" && u.port === "443")
      ) {
        u.port = "";
      }
      // collapse multiple slashes except after protocol
      u.pathname = u.pathname.replace(/\/{2,}/g, "/");
      // strip empty query
      if ([...u.searchParams.keys()].length === 0) {
        u.search = "";
      }
    },

    // Main entry: returns cleaned href as string
    cleanHref(input, base = location.href) {
      let u;
      try {
        u = new URL(input, base);
      } catch (_) {
        return input; // non-URL or malformed
      }

      // Don’t touch internal schemes
      const s = u.protocol + "";
      if (s === "javascript:" || s === "data:" || s === "blob:" || s === "about:") {
        return u.toString();
      }

      // 1) Try to unwrap redirectors
      const unwrapped = this.resolveRedirector(u);
      if (unwrapped) {
        u = unwrapped;
      }

      // 2) Global param strip
      this.stripParams(u);

      // 3) Domain-specific tweaks
      this.byDomain(u);

      // 4) Normalize
      this.normalize(u);

      return u.toString();
    },
  };

  /**
   * --- DOM/SPA Integration for Cleaning --------------------------------------
   * Rewrites href/src/action when discovered or on navigation.
   */
  const URLCleaningRuntime = {
    // Rewrite a single element in-place if attribute exists
    rewriteElAttr(el, attr) {
      const val = el.getAttribute(attr);
      if (!val) {
        return;
      }
      const cleaned = URLCleaner.cleanHref(val);
      if (cleaned && cleaned !== val) {
        el.setAttribute(attr, cleaned);
        el.dataset.privacyGuardCleaned = "1";
      }
    },

    // Initial and incremental sweeps
    sweep(root) {
      if (!root || root.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      // Only scan relevant elements
      root.querySelectorAll("a[href], img[src], form[action]").forEach((el) => {
        if (el.dataset.privacyGuardCleaned === "1") {
          return;
        }
        if (el.tagName === "A") {
          this.rewriteElAttr(el, "href");
        } else if (el.tagName === "IMG") {
          this.rewriteElAttr(el, "src");
        } else if (el.tagName === "FORM") {
          this.rewriteElAttr(el, "action");
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
              if (n.matches && n.matches("a[href],img[src],form[action]")) {
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
              m.attributeName === "action"
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
        attributeFilter: ["href", "src", "action"],
      });
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
      // Final pass on full load (late-injected links)
      window.addEventListener("load", () => this.sweep(document));
    },
  };

  // --- Initialization ---
  PrivacyGuard.init();
})();
