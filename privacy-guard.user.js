// ==UserScript==
// @name         Privacy Guard
// @namespace    com.aesthermortis.privacy-guard
// @version      1.4.0
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

  /**
   * Feature toggles
   */
  const FEATURES = {
    uiPanel: true,
    perDomainOverrides: true,
    extraRedirectors: true,
    rules: {
      youtube: true,
      ebay: true,
    },
  };

  /**
   * Runtime mode toggles.
   * - "fail" emulates a real network failure (recommended to avoid spinners).
   * - "silent" returns empty 204 responses (may break some UIs).
   * @type {{ networkBlock: string; }}
   */
  const MODE = {
    networkBlock: "fail", // "fail" | "silent"
  };

  /**
   * Script blocking strategy:
   * - "createElement": intercepts document.createElement to block scripts before they are added to the DOM.
   * - "observer": uses MutationObserver to neutralize scripts after they are added to the DOM (less effective).
   * @type {{ scriptBlockMode: string; }}
   */
  const CONFIG = {
    scriptBlockMode: "createElement", // "createElement" | "observer"
  };

  /**
   * Utilities: storage and overrides
   * Domain-specific overrides are stored in localStorage under the key "PG_OVERRIDES::<hostname>"
   */
  const STORAGE = {
    PREFIX: "PG_OVERRIDES::",
    keyFor(hostname) {
      return `${this.PREFIX}${hostname}`;
    },
    get(hostname) {
      try {
        const raw = localStorage.getItem(this.keyFor(hostname));
        if (!raw) {
          return null;
        }
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },
    set(hostname, obj) {
      try {
        localStorage.setItem(this.keyFor(hostname), JSON.stringify(obj));
      } catch (e) {
        /* ignore */
      }
    },
    remove(hostname) {
      try {
        localStorage.removeItem(this.keyFor(hostname));
      } catch (e) {
        /* ignore */
      }
    },
  };

  function applyOverridesForHost(hostname) {
    if (!FEATURES.perDomainOverrides) {
      return;
    }
    const o = STORAGE.get(hostname);
    if (!o || o.enabled === false) {
      return;
    }
    if (o.networkBlock === "fail" || o.networkBlock === "silent") {
      MODE.networkBlock = o.networkBlock;
    }
    if (o.scriptBlockMode === "createElement" || o.scriptBlockMode === "observer") {
      CONFIG.scriptBlockMode = o.scriptBlockMode;
    }
  }

  // Apply at boot using current document host
  try {
    applyOverridesForHost(location.hostname);
  } catch (e) {
    /* ignore */
  }

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
   * Lightweight event log (per tab)
   *
   * @type {{ push: (evt: any) => void; list: () => any; }}
   */
  const EventLog = (() => {
    const _events = [];
    const LIMIT = 80;
    function push(evt) {
      _events.push({ time: Date.now(), ...evt });
      if (_events.length > LIMIT) {
        _events.shift();
      }
    }
    function list() {
      return _events.slice().reverse();
    }
    return { push, list };
  })();

  /**
   * PrivacyGuard core
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
      } catch {
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
      try {
        node.remove();
      } catch {
        /* ignore */
      }
      try {
        EventLog.push({ kind: "remove", reason, url: node.src || "" });
      } catch {
        /* ignore */
      }
      try {
        console.debug(`[Privacy Guard] Blocked and removed ${reason}:`, node.src || "");
      } catch {
        /* ignore */
      }
    },

    /**
     * Intercepts the creation of script elements to block them before they are
     * added to the DOM, preventing execution entirely. This is the most effective
     * method against dynamically injected scripts.
     */
    interceptElementCreation() {
      // Check for existence of Document and document to avoid errors in some environments
      const hasCtor = typeof Document !== "undefined" && Document && Document.prototype;
      const hasDoc = typeof document !== "undefined" && document;
      const originalCreateElement =
        (hasCtor && Document.prototype.createElement) || (hasDoc && document.createElement);
      if (!originalCreateElement || !hasDoc) {
        return;
      }
      const self = this;

      // Patch only script element creation to avoid breaking other element types
      document.createElement = function (...args) {
        const tagName = args[0] ? String(args[0]).toLowerCase() : "";
        const element = originalCreateElement.apply(this, args);

        if (tagName === "script") {
          try {
            Object.defineProperty(element, "src", {
              configurable: true,
              enumerable: true,
              set(value) {
                try {
                  if (self.shouldBlock(value)) {
                    console.debug("[Privacy Guard] Prevented script creation:", value);
                    EventLog.push({ kind: "script", reason: "createElement", url: String(value) });
                    // Set a non-executable type to neutralize the script
                    element.setAttribute("type", "text/plain");
                  }
                  // Set the original value (or let it be handled by the neutralized type)
                  element.setAttribute("src", value);
                } catch {
                  element.setAttribute("src", value);
                }
              },
              get() {
                return element.getAttribute("src");
              },
            });
          } catch {
            /* ignore */
          }
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
      } catch {
        /* ignore */
      }
      try {
        el.removeAttribute("nonce");
      } catch {
        /* ignore */
      }
      try {
        this.removeNode(el, "script");
      } catch {
        /* ignore */
      }
    },

    /**
     * Scans a node and its children for elements to block (iframes, scripts).
     * @param {Node} node - The root node to scan.
     */
    scanNodeForBlockedElements(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
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
      const originalFetch = window.fetch ? window.fetch.bind(window) : null;
      if (!originalFetch) {
        return;
      }
      // Use a normal function to keep a callable with a proper [[ThisMode]]
      window.fetch = function (...args) {
        const [input] = args;
        const url = typeof input === "string" ? input : input && input.url ? input.url : "";

        if (PrivacyGuard.shouldBlock(url)) {
          console.debug("[Privacy Guard] Blocked fetch:", url);
          EventLog.push({ kind: "fetch", reason: MODE.networkBlock, url: String(url) });
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
      const originalSendBeacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
      if (!originalSendBeacon) {
        return;
      }

      navigator.sendBeacon = (url, data) => {
        if (this.shouldBlock(url)) {
          console.debug("[Privacy Guard] Blocked beacon:", url);
          EventLog.push({ kind: "beacon", reason: "blocked", url: String(url) });
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
      const PRIVACY_GUARD_URL = Symbol("privacyGuardUrl");

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        // Store URL on a non-enumerable, collision-proof key
        try {
          this[PRIVACY_GUARD_URL] = url;
        } catch {
          /* ignore */
        }
        originalOpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function (...args) {
        if (this[PRIVACY_GUARD_URL] && self.shouldBlock(String(this[PRIVACY_GUARD_URL]))) {
          console.debug("[Privacy Guard] Blocked XHR:", this[PRIVACY_GUARD_URL]);
          EventLog.push({
            kind: "xhr",
            reason: MODE.networkBlock,
            url: String(this[PRIVACY_GUARD_URL]),
          });
          // Emulate real network failure: dispatch 'error' and 'abort', then 'loadend'
          Promise.resolve().then(() => {
            try {
              this.dispatchEvent(new ProgressEvent("error"));
            } catch {
              /* ignore */
            }
            try {
              this.dispatchEvent(new ProgressEvent("abort"));
            } catch {
              /* ignore */
            }
            try {
              this.dispatchEvent(new Event("loadend"));
            } catch {
              /* ignore */
            }
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
      if (this._initialized) {
        return;
      }
      this._initialized = true;

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
   * URL Cleaning Module
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
      // Extra redirectors if enabled
      ...(FEATURES.extraRedirectors
        ? [
            { hostIncludes: "youtube.com", pathHas: "/redirect", param: ["q", "url", "u"] },
            { hostIncludes: "youtu.be", param: ["q", "url"] },
            { hostIncludes: "l.instagram.com", param: ["u", "url"] },
            { hostIncludes: "lnkd.in", param: ["url"] },
            { hostIncludes: "linkedin.com", pathHas: "/redir/redirect", param: ["url"] },
            { hostIncludes: "bing.com", pathHas: "/ck/a", param: ["u", "url"] },
            { hostIncludes: "r20.rs6.net", param: ["url"] },
            { hostIncludes: "safelinks.protection.outlook.com", param: ["url"] },
          ]
        : []),
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
        return;
      }

      // YOUTUBE: strip noisy params, keep essential ones
      if (
        FEATURES.rules.youtube &&
        (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com")
      ) {
        this.cleanYouTube(u);
        return;
      }
      if (FEATURES.rules.youtube && host === "youtu.be") {
        this.cleanYouTuBeShort(u);
        return;
      }

      // eBay: strip noisy params, keep essential ones
      if (
        FEATURES.rules.ebay &&
        (host.endsWith(".ebay.com") ||
          host.endsWith(".ebay.co.uk") ||
          host.endsWith(".ebay.de") ||
          host.endsWith(".ebay.fr") ||
          host.endsWith(".ebay.it") ||
          host.endsWith(".ebay.es"))
      ) {
        this.cleanEbay(u);
        return;
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

    cleanYouTube(u) {
      // Canonicalize watch URLs: keep essential intent (v, t, list/index for playlists)
      // Remove share/tracking junk (si, pp, feature, ab_channel, etc.)
      if (u.pathname === "/redirect") {
        // Will be handled by resolveRedirector
        return;
      }
      if (u.pathname !== "/watch" && u.pathname.startsWith("/shorts/")) {
        // Convert shorts to watch
        const id = u.pathname.split("/")[2];
        if (id) {
          u.pathname = "/watch";
          u.search = "";
          u.searchParams.set("v", id);
        }
      }
      if (u.pathname === "/watch") {
        const allow = new Set(["v", "t", "list", "index"]);
        this.stripParams(u, allow, false);
        // Normalize host
        u.hostname = "www.youtube.com";
      }
    },

    cleanYouTuBeShort(u) {
      // youtu.be/<id>?t=xx => https://www.youtube.com/watch?v=<id>&t=xx
      const parts = u.pathname.split("/").filter(Boolean);
      const id = parts[0];
      if (id && id.length > 5) {
        const keepT = u.searchParams.get("t");
        u.hostname = "www.youtube.com";
        u.pathname = "/watch";
        u.search = "";
        u.searchParams.set("v", id);
        if (keepT) {
          u.searchParams.set("t", keepT);
        }
      }
    },

    cleanEbay(u) {
      // Keep intent: item id, query terms; drop marketing noise (mkcid, mkevt, campid, customid, etc.)
      const allow = new Set([
        "_nkw",
        "_sop",
        "_udlo",
        "_udhi",
        "_pgn",
        "rt",
        "hash",
        "nid",
        "epid",
        "mkrid",
        "_from",
        "_trksid",
      ]);
      this.stripParams(u, allow, false);
      // Remove hash marketing fragments like #itmhash
      if (u.hash && /itm|mkcid|campid|mkevt/i.test(u.hash)) {
        u.hash = "";
      }
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
        // Amazon-specific noisy params to remove unless explicitly allowed
        if (
          !inAllow &&
          (v === "" ||
            keyLC === "ref" ||
            keyLC === "ref_src" ||
            keyLC === "ref_url" ||
            keyLC.startsWith("ref_") ||
            keyLC === "_encoding" ||
            keyLC.startsWith("pf_rd_") ||
            keyLC.startsWith("pd_rd_") ||
            keyLC === "content-id" ||
            keyLC === "si" ||
            keyLC === "pp" ||
            keyLC === "feature" ||
            keyLC === "ab_channel")
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
              } catch {
                // sometimes the value is encoded twice
                try {
                  return new URL(decodeURIComponent(target));
                } catch {
                  /* ignore */
                }
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
      } catch {
        return input; // non-URL or malformed
      }

      // Don’t touch internal schemes
      const s = u.protocol + "";
      if (s === "javascript:" || s === "data:" || s === "blob:" || s === "about:") {
        return u.toString();
      }

      // Try to unwrap redirectors
      const unwrapped = this.resolveRedirector(u);
      if (unwrapped) {
        u = unwrapped;
      }

      // Global param strip
      this.stripParams(u);

      // Domain-specific tweaks
      this.byDomain(u);

      // Normalize
      this.normalize(u);

      return u.toString();
    },
  };

  /**
   * URL Cleaning Runtime
   * Handles DOM interactions and SPA navigation for URL cleaning.
   * Applies to <a href>, <img src>, and <form action>.
   */
  const URLCleaningRuntime = {
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
        if (PrivacyGuard.shouldBlock(href)) {
          linkEl.remove();
          return;
        }
        // if not blocked, at least clean the href
        const cleaned = URLCleaner.cleanHref(href);
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

  /*
   * -------------------------
   * UI Panel (CTRL+SHIFT+Q)
   * -------------------------
   */
  if (FEATURES.uiPanel) {
    const UIPanel = (() => {
      let root = null;
      let visible = false;
      function css() {
        const id = "pg-style";
        if (document.getElementById(id)) {
          return;
        }
        const style = document.createElement("style");
        style.id = id;
        style.textContent = /* css */ `
          .pg-panel {
            position: fixed; /* fixed */
            top: 12px; /* top */
            right: 12px; /* right */
            z-index: 2147483647; /* very high */
            box-sizing: border-box; /* box-sizing */
            width: 360px; /* width */
            max-height: 80vh; /* max height */
            padding: 12px; /* padding */
            overflow: auto; /* overflow */
            background: rgba(20, 23, 28, 0.95); /* background */
            color: #F8FAFC; /* color */
            border: 1px solid #111827; /* border */
            border-radius: 14px; /* radius */
            box-shadow: 0 8px 24px rgba(0,0,0,.3); /* shadow */
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji; /* font */
            font-size: 14px; /* size */
            line-height: 1.35; /* line-height */
          }
          .pg-panel * { box-sizing: border-box; }
          .pg-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
          .pg-kv { display: grid; grid-template-columns: 110px 1fr; gap: 8px; margin: 6px 0; }
          .pg-chip { display: inline-block; padding: 2px 8px; border-radius: 9999px; background: #0F172A; }
          .pg-btn { cursor: pointer; border: 1px solid #1F2937; border-radius: 10px; padding: 6px 10px; background: #111827; color: #E5E7EB; }
          .pg-btn:hover { background: #0B1220; }
          .pg-log { margin-top: 8px; border-top: 1px solid #1F2937; padding-top: 8px; }
          .pg-log-item { border-bottom: 1px dashed #1F2937; padding: 6px 0; word-break: break-all; }
          .pg-title { font-weight: 700; font-size: 15px; }
          .pg-muted { color: #9CA3AF; }
          .pg-right { margin-left: auto; }
          .pg-input { width: 100%; padding: 6px 8px; border: 1px solid #1F2937; border-radius: 8px; background: #0B1220; color: #E5E7EB; }
        `;
        document.documentElement.appendChild(style);
      }
      function view() {
        const o = STORAGE.get(location.hostname) || { enabled: true };
        const nb = o.networkBlock || MODE.networkBlock;
        const sbm = o.scriptBlockMode || CONFIG.scriptBlockMode;
        const list = EventLog.list();
        const html = `
          <div class="pg-row"><span class="pg-title">Privacy Guard</span><span class="pg-chip">${
            location.hostname
          }</span><button class="pg-btn pg-close pg-right" title="Close">❌</button></div>
          <div class="pg-kv"><div>Network block</div>
            <div>
              <select class="pg-input pg-nb">
                <option value="fail" ${
                  nb === "fail" ? "selected" : ""
                }>fail (emulate network error)</option>
                <option value="silent" ${
                  nb === "silent" ? "selected" : ""
                }>silent (204 no content)</option>
              </select>
            </div>
          </div>
          <div class="pg-kv"><div>Script mode</div>
            <div>
              <select class="pg-input pg-sbm">
                <option value="createElement" ${
                  sbm === "createElement" ? "selected" : ""
                }>createElement (strict)</option>
                <option value="observer" ${
                  sbm === "observer" ? "selected" : ""
                }>observer (conservative)</option>
              </select>
            </div>
          </div>
          <div class="pg-row"><label><input type="checkbox" class="pg-enable" ${
            o.enabled !== false ? "checked" : ""
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
        css();
        root = document.createElement("div");
        root.className = "pg-panel";
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-label", "Privacy Guard Panel");
        document.documentElement.appendChild(root);
        redraw();
        root.addEventListener("click", (e) => {
          const t = e.target;
          if (!(t instanceof Element)) {
            return;
          }
          if (t.classList.contains("pg-close")) {
            hide();
            return;
          }
          if (t.classList.contains("pg-save")) {
            const o = STORAGE.get(location.hostname) || {};
            const nb = root.querySelector(".pg-nb");
            const sbm = root.querySelector(".pg-sbm");
            const en = root.querySelector(".pg-enable");
            const next = {
              enabled: en && en.checked ? true : false,
              networkBlock: nb && nb.value ? nb.value : MODE.networkBlock,
              scriptBlockMode: sbm && sbm.value ? sbm.value : CONFIG.scriptBlockMode,
            };
            STORAGE.set(location.hostname, next);
            applyOverridesForHost(location.hostname);
            redraw();
            return;
          }
          if (t.classList.contains("pg-reset")) {
            STORAGE.remove(location.hostname);
            applyOverridesForHost(location.hostname);
            redraw();
            return;
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

    // --- Hotkey configuration ---
    const DEFAULT_HOTKEY = { ctrl: true, shift: true, alt: false, key: "q" }; // Ctrl+Shift+Q
    const hotkey = null; // custom hotkey object or null for default

    function matchHotkey(e, hk) {
      if (!hk) {
        return false;
      }
      const k = (e.key || "").toLowerCase();
      return (
        !!e.ctrlKey === !!hk.ctrl &&
        !!e.shiftKey === !!hk.shift &&
        !!e.altKey === !!hk.alt &&
        k === (hk.key || "").toLowerCase()
      );
    }

    window.addEventListener(
      "keydown",
      (e) => {
        try {
          // do not interfere when typing in inputs/textarea/contentEditable
          const a = document.activeElement;
          const inEdit =
            a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
          if (inEdit) {
            return;
          }

          if (matchHotkey(e, hotkey || DEFAULT_HOTKEY)) {
            e.preventDefault();
            e.stopPropagation();
            UIPanel.toggle();
            return;
          }
        } catch {
          /* ignore */
        }
      },
      true,
    );

    // Live refresh on navigation events
    window.addEventListener("popstate", () => UIPanel.redraw());
    window.addEventListener("hashchange", () => UIPanel.redraw());
  }

  // Privacy Guard Initialization
  PrivacyGuard.init();
})();
