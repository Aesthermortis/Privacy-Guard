// ==UserScript==
// @name         Privacy Guard
// @namespace    com.aesthermortis.privacy-guard
// @version      1.1.0
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
    // Add more patterns here
  ];

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
      // Using 'some' is efficient as it stops on the first match.
      return BLOCKED_PATTERNS.some((pattern) => url.includes(pattern));
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
        this.removeNode(node, "script");
        return;
      }

      // Scan children of the node
      const elements = node.querySelectorAll("iframe[src], script[src]");
      elements.forEach((el) => {
        if (this.shouldBlock(el.src)) {
          this.removeNode(el, el.tagName.toLowerCase());
        }
      });
    },

    /**
     * Sets up a MutationObserver to watch for dynamically added nodes.
     */
    observeDOMChanges() {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => this.scanNodeForBlockedElements(node));
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    },

    /**
     * Intercepts `fetch` requests to block trackers.
     */
    interceptFetch() {
      const originalFetch = window.fetch;
      window.fetch = (...args) => {
        const [input] = args;
        const url = typeof input === "string" ? input : input?.url || "";

        if (this.shouldBlock(url)) {
          console.debug("[Privacy Guard] Blocked fetch:", url);
          return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
        }

        return originalFetch.apply(this, args);
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
          return true; // Pretend the request was sent successfully
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
          // Silently abort the request by not calling the original `send`.
          // Dispatch a 'loadend' event to allow any dependent logic to complete.
          this.dispatchEvent(new Event("loadend"));
          return;
        }
        originalSend.apply(this, args);
      };
    },

    /**
     * Initializes all privacy-enhancing features.
     */
    init() {
      // Intercept network requests first
      this.interceptFetch();
      this.interceptBeacon();
      this.interceptXHR();

      // Handle DOM elements. Run immediately on existing elements.
      // The check for `document.body` handles scripts running on a blank page.
      if (document.body) {
        this.scanNodeForBlockedElements(document.body);
      }

      // Then, observe for future changes.
      this.observeDOMChanges();
    },
  };

  // --- Initialization ---
  PrivacyGuard.init();
})();
