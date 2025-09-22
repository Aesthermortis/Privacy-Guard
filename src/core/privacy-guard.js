import { MODE, CONFIG } from "../config.js";
import { BLOCKED_HOSTS, BLOCKED_RULES } from "../blocklist.js";
import { ALLOWED_HOSTS, ALLOWED_RULES, ALLOWED_SCHEMES } from "../allowlists.js";
import { EventLog } from "../event-log.js";
import { URLCleaningRuntime, setShouldBlock } from "../url/runtime.js";

function hostnameMatches(urlObj, patterns = []) {
  if (!urlObj || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  const host = (urlObj.hostname || "").toLowerCase();
  if (!host) {
    return false;
  }
  return patterns.some((pattern) => {
    if (!pattern) {
      return false;
    }
    const pat = String(pattern).trim().toLowerCase();
    if (!pat || pat === "*") {
      return false;
    }
    if (pat.startsWith("*.")) {
      const base = pat.slice(2);
      if (!base) {
        return false;
      }
      return host === base || host.endsWith(`.${base}`);
    }
    return host === pat || host.endsWith(`.${pat}`);
  });
}

function urlMatches(urlObj, rules = []) {
  if (!urlObj || !Array.isArray(rules) || rules.length === 0) {
    return false;
  }
  return rules.some((rule) => {
    if (!rule || !rule.host) {
      return false;
    }
    if (!hostnameMatches(urlObj, [rule.host])) {
      return false;
    }
    if (!rule.pathStartsWith) {
      return true;
    }
    const prefix = rule.pathStartsWith.startsWith("/")
      ? rule.pathStartsWith
      : `/${rule.pathStartsWith}`;
    return urlObj.pathname.startsWith(prefix);
  });
}
export const PrivacyGuard = {
  /**
   * Checks if a given URL or src attribute matches any blocked pattern.
   * @param {string | null | undefined} url - The URL or src to check.
   * @returns {boolean} - True if the URL should be blocked.
   */
  shouldBlock(url) {
    if (!url) {
      return false;
    }

    const urlString = String(url);

    for (const scheme of ALLOWED_SCHEMES) {
      if (urlString.startsWith(scheme)) {
        return false;
      }
    }

    let parsed;
    try {
      parsed = new URL(urlString, location.href);
    } catch {
      parsed = null;
    }

    if (parsed) {
      if (hostnameMatches(parsed, ALLOWED_HOSTS) || urlMatches(parsed, ALLOWED_RULES)) {
        return false;
      }

      if (CONFIG.allowSameOrigin && parsed.hostname === location.hostname) {
        return false;
      }

      if (hostnameMatches(parsed, BLOCKED_HOSTS) || urlMatches(parsed, BLOCKED_RULES)) {
        return true;
      }
    }

    return false;
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
   * Hardens script insertion by intercepting various DOM methods and properties
   * to prevent blocked scripts from being added or executed.
   * Intercepts setAttribute, property setters, and DOM insertion methods for <script> elements.
   * No parameters.
   * @returns {void}
   */
  hardenScriptInsertion() {
    if (this._scriptHardeningApplied) {
      return;
    }
    this._scriptHardeningApplied = true;
    const guard = this;

    // Intercept attribute-based assignment
    const elementProto = typeof Element !== "undefined" ? Element.prototype : null;
    if (elementProto && elementProto.setAttribute) {
      const originalSetAttribute = elementProto.setAttribute;
      elementProto.setAttribute = function (name, value) {
        try {
          if (
            this &&
            typeof this.tagName === "string" &&
            this.tagName.toUpperCase() === "SCRIPT" &&
            typeof name === "string" &&
            name.toLowerCase() === "src"
          ) {
            if (guard.shouldBlock(value)) {
              const blockedUrl = String(value);
              guard.neutralizeScript(this);
              try {
                EventLog.push({ kind: "script", reason: "setAttribute", url: blockedUrl });
              } catch {
                /* ignore */
              }
              return;
            }
          }
        } catch {
          /* ignore */
        }
        return originalSetAttribute.call(this, name, value);
      };
    }

    // Intercept property-based assignment at prototype level
    const scriptProto =
      typeof HTMLScriptElement !== "undefined" && HTMLScriptElement
        ? HTMLScriptElement.prototype
        : null;
    if (scriptProto) {
      const descriptor = Object.getOwnPropertyDescriptor(scriptProto, "src");
      if (descriptor && typeof descriptor.set === "function") {
        Object.defineProperty(scriptProto, "src", {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: descriptor.get,
          set(value) {
            try {
              if (guard.shouldBlock(value)) {
                const blockedUrl = String(value);
                guard.neutralizeScript(this);
                try {
                  EventLog.push({ kind: "script", reason: "prop:set", url: blockedUrl });
                } catch {
                  /* ignore */
                }
                return;
              }
            } catch {
              /* ignore */
            }
            descriptor.set.call(this, value);
          },
        });
      }
    }

    // Intercept node insertion to inspect detached SCRIPTs
    const intercept = (Proto, method) => {
      if (!Proto || !Proto.prototype) {
        return;
      }
      const original = Proto.prototype[method];
      if (typeof original !== "function") {
        return;
      }
      Proto.prototype[method] = function (node, ...rest) {
        try {
          if (node && typeof node.tagName === "string" && node.tagName.toUpperCase() === "SCRIPT") {
            const blockedUrl = node.getAttribute("src") || node.src || "";
            if (guard.shouldBlock(blockedUrl)) {
              guard.neutralizeScript(node);
              try {
                EventLog.push({ kind: "script", reason: "dom:" + method, url: String(blockedUrl) });
              } catch {
                /* ignore */
              }
              return node;
            }
          }
        } catch {
          /* ignore */
        }
        return original.call(this, node, ...rest);
      };
    };

    if (typeof Node !== "undefined" && Node && Node.prototype) {
      intercept(Node, "appendChild");
      intercept(Node, "insertBefore");
    }
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
    const guard = this;
    // Use a normal function to keep a callable with a proper [[ThisMode]]
    window.fetch = function (...args) {
      const [input] = args;
      const url = typeof input === "string" ? input : input && input.url ? input.url : "";

      if (guard.shouldBlock(url)) {
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
    this.hardenScriptInsertion();

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

setShouldBlock((url) => PrivacyGuard.shouldBlock(url));
