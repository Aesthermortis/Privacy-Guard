// ==UserScript==
// @name         Privacy Guard
// @namespace    com.aesthermortis.privacy-guard
// @version      1.0.0
// @description  Blocks tracker iframes and silences analytics requests to reduce CPU/RAM usage and improve privacy.
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

  // Domain patterns to block in <iframe src="...">
  const BLOCKED_IFRAME_PATTERNS = [
    "imasdk.googleapis.com",
    "doubleclick.net",
    "adservice.google.com",
    "googlesyndication.com",
    "facebook.com/plugins",
    "facebook.com/v", // covers /vXX.X/
    "facebook.com/plugins/comments",
    // add more patterns here as needed
  ];

  // URL patterns to block for network requests (fetch / sendBeacon)
  const BLOCKED_URL_PATTERNS = [
    "google-analytics.com",
    "googletagmanager.com",
    "googlesyndication.com",
    "doubleclick.net",
    // add more patterns here as needed
  ];

  // Function to check if an iframe should be blocked
  function shouldBlockIframe(src) {
    return BLOCKED_IFRAME_PATTERNS.some((pattern) => src && src.includes(pattern));
  }

  // Helper function to check if a request URL should be blocked
  function shouldBlockRequest(url) {
    return BLOCKED_URL_PATTERNS.some((pattern) => url.includes(pattern));
  }

  // Removes all matching iframes present in the DOM when the script loads
  function removeBlockedIframes() {
    document.querySelectorAll("iframe").forEach((el) => {
      const src = el.getAttribute("src");
      if (shouldBlockIframe(src)) {
        el.remove();
      }
    });
  }

  // Main logic to set up observers and initial cleanup
  function initializeGuard() {
    // Observer that removes unwanted new iframes as soon as they are added to the DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.tagName === "IFRAME") {
            const src = node.getAttribute("src");
            if (shouldBlockIframe(src)) {
              node.remove();
            }
          }
          // If complete containers are added, scan their children
          if (node.nodeType === 1 && node.querySelectorAll) {
            node.querySelectorAll("iframe").forEach((el) => {
              const src = el.getAttribute("src");
              if (shouldBlockIframe(src)) {
                el.remove();
              }
            });
          }
        });
      }
    });

    // Start the observer on the entire document body
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Call the function once at the beginning (for already loaded iframes)
    removeBlockedIframes();
  }

  // Defer initialization until document.body is available
  if (document.body) {
    initializeGuard();
  } else {
    new MutationObserver((mutations, obs) => {
      if (document.body) {
        initializeGuard();
        obs.disconnect();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Intercept fetch
  const _fetch = window.fetch;
  window.fetch = function (...args) {
    const [input] = args;
    const url = typeof input === "string" ? input : input?.url || "";
    if (url && shouldBlockRequest(url)) {
      console.debug("[Privacy Guard] Blocked fetch:", url);
      return Promise.resolve(new Response("", { status: 204 }));
    }
    return _fetch.apply(this, args);
  };

  // Intercept sendBeacon
  const _beacon = navigator.sendBeacon?.bind(navigator);
  if (_beacon) {
    navigator.sendBeacon = function (url, data) {
      if (url && shouldBlockRequest(url)) {
        console.debug("[Privacy Guard] Blocked beacon:", url);
        return true; // pretend success to caller
      }
      return _beacon(url, data);
    };
  }

  // Intercept XMLHttpRequest
  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (url && shouldBlockRequest(String(url))) {
      console.debug("[Privacy Guard] Blocked XHR:", url);
      // Silently abort the request by not calling the original open
      // We can also add a dummy event listener to prevent errors on send
      this.addEventListener("readystatechange", (e) => e.stopImmediatePropagation(), true);
      return;
    }
    // Call the original method. It does not have a return value.
    _xhrOpen.apply(this, [method, url, ...rest]);
  };
})();
