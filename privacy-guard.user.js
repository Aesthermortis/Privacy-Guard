// ==UserScript==
// @name         Privacy Guard
// @namespace    com.aesthermortis.privacy-guard
// @version      1.2.0
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

      // Do not block internal/browser-only schemes
      if (
        urlString.startsWith("blob:") ||
        urlString.startsWith("data:") ||
        urlString.startsWith("chrome-extension:")
      ) {
        return false;
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

      // One full scan when the page is stable
      window.addEventListener("load", () =>
        this.scanNodeForBlockedElements(document.documentElement),
      );
    },
  };

  // --- Initialization ---
  PrivacyGuard.init();
})();
