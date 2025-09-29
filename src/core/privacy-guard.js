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

  const normalize = (value) => {
    if (!value) {
      return "";
    }
    return value.endsWith(".") ? value.slice(0, -1) : value;
  };
  const labelsMatch = (hostname, pattern) => {
    const hostParts = hostname.split(".");
    const patternParts = pattern.split(".");
    if (patternParts.length < 2 || patternParts.length > hostParts.length) {
      return false;
    }
    const tail = hostParts.slice(-patternParts.length).join(".");
    return tail === pattern;
  };
  const hostNorm = normalize(host);

  return patterns.some((pattern) => {
    if (!pattern) {
      return false;
    }
    const pat = String(pattern).trim().toLowerCase();
    if (!pat || pat === "*") {
      return false;
    }

    const patNorm = normalize(pat);
    if (patNorm.startsWith("*.")) {
      const base = patNorm.slice(2);
      if (!base) {
        return false;
      }
      return hostNorm === base || labelsMatch(hostNorm, base);
    }
    return hostNorm === patNorm || labelsMatch(hostNorm, patNorm);
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
                  // Return to prevent the `src` attribute from being set, which would
                  // trigger a network request and leak the user's IP address.
                  return;
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
    if (typeof MutationObserver !== "function" || !document) {
      return;
    }

    const RELEVANT_SELECTOR = "script[src], iframe[src]";
    const hasElementCtor = typeof Element === "function";
    const pending = new Set();
    let scheduled = false;

    const schedule = () => {
      const run = () => {
        scheduled = false;
        if (!pending.size) {
          return;
        }

        const roots = [];
        for (const node of pending) {
          if (!hasElementCtor || !(node instanceof Element) || !node.isConnected) {
            continue;
          }
          if (roots.some((existing) => existing.contains(node))) {
            continue;
          }
          for (let i = roots.length - 1; i >= 0; i -= 1) {
            if (node.contains(roots[i])) {
              roots.splice(i, 1);
            }
          }
          roots.push(node);
        }

        pending.clear();

        if (!roots.length) {
          return;
        }

        for (const root of roots) {
          this.scanNodeForBlockedElements(root);
        }

        if (pending.size) {
          schedule();
        }
      };

      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => run(), { timeout: 50 });
      } else {
        requestAnimationFrame(() => run());
      }
    };

    const collectNode = (node) => {
      if (!hasElementCtor || !(node instanceof Element)) {
        return;
      }

      if (node.tagName === "SCRIPT") {
        const src = node.getAttribute("src") || "";
        if (this.shouldBlock(src)) {
          this.neutralizeScript(node);
          return;
        }
      }

      if (node.tagName === "IFRAME" && this.shouldBlock(node.src)) {
        this.removeNode(node, "iframe");
        return;
      }

      if (
        node.matches(RELEVANT_SELECTOR) ||
        (typeof node.querySelector === "function" && node.querySelector(RELEVANT_SELECTOR))
      ) {
        pending.add(node);
      }

      if (!scheduled && pending.size) {
        scheduled = true;
        schedule();
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes?.forEach(collectNode);
      }
    });

    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  },

  /**
   * Intercepts `fetch` requests to block trackers.
   */
  interceptFetch() {
    const originalFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!originalFetch) {
      return;
    }
    const guard = this;
    window.fetch = function (...args) {
      const [input] = args;
      const url = typeof input === "string" ? input : input && input.url ? input.url : "";

      if (guard.shouldBlock(url)) {
        console.debug("[Privacy Guard] Blocked fetch:", url);
        EventLog.push({ kind: "fetch", reason: MODE.networkBlock, url: String(url) });
        if (MODE.networkBlock === "silent") {
          return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
        }
        return Promise.reject(new TypeError("PrivacyGuard blocked: " + url));
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
   * Intercepts WebSocket connections.
   */
  interceptWebSocket() {
    const alreadyPatched = window.WebSocket && window.WebSocket.__PG_isPatched === true;
    if (alreadyPatched) {
      return;
    }

    const OriginalWebSocket =
      (window.WebSocket && window.WebSocket.__PG_original) || window.WebSocket;
    if (!OriginalWebSocket) {
      return;
    }
    const guard = this;

    function makeEmitter(target) {
      const listeners = new Map();
      target.addEventListener = function (type, handler) {
        if (!type || typeof handler !== "function") {
          return;
        }
        const handlers = listeners.get(type) || [];
        handlers.push(handler);
        listeners.set(type, handlers);
      };
      target.removeEventListener = function (type, handler) {
        const handlers = listeners.get(type) || [];
        const index = handlers.indexOf(handler);
        if (index >= 0) {
          handlers.splice(index, 1);
        }
      };
      target.dispatchEvent = function (event) {
        const type = event && event.type ? String(event.type) : "";
        const handlers = listeners.get(type) || [];
        for (const handler of handlers.slice()) {
          try {
            handler.call(target, event);
          } catch {
            /* ignore */
          }
        }
        const prop = "on" + type;
        if (typeof target[prop] === "function") {
          try {
            target[prop].call(target, event);
          } catch {
            /* ignore */
          }
        }
        return true;
      };
    }

    function schedule(fn) {
      if (typeof queueMicrotask === "function") {
        queueMicrotask(fn);
        return;
      }
      Promise.resolve().then(fn);
    }

    const canCloseEvent = typeof CloseEvent === "function";
    function dispatchClose(target, wasClean) {
      if (canCloseEvent) {
        try {
          target.dispatchEvent(
            new CloseEvent("close", { code: 1006, reason: "", wasClean: !!wasClean }),
          );
          return;
        } catch {
          /* ignore */
        }
      }
      target.dispatchEvent(new Event("close"));
    }

    function createBlockedStub(url, mode) {
      const stub = Object.create(OriginalWebSocket.prototype);
      makeEmitter(stub);

      stub.url = String(url);
      stub.readyState = OriginalWebSocket.CLOSED;
      stub.extensions = "";
      stub.protocol = "";
      stub.binaryType = "blob";
      stub.bufferedAmount = 0;
      stub.close = function () {
        /* no-op */
      };
      stub.send = function () {
        /* drop silently */
      };

      schedule(() => {
        try {
          if (mode === "silent") {
            dispatchClose(stub, true);
          } else {
            stub.dispatchEvent(new Event("error"));
            dispatchClose(stub, false);
          }
        } catch {
          /* ignore */
        }
      });

      return stub;
    }

    function wrap(url, protocols) {
      const urlString = String(url);
      if (guard.shouldBlock(urlString)) {
        try {
          console.debug("[Privacy Guard] Blocked WebSocket:", urlString);
        } catch {
          /* ignore */
        }
        try {
          EventLog.push({ kind: "websocket", reason: MODE.networkBlock, url: urlString });
        } catch {
          /* ignore */
        }

        if (MODE.networkBlock === "silent") {
          return createBlockedStub(urlString, "silent");
        }

        throw new TypeError("PrivacyGuard blocked WebSocket: " + urlString);
      }

      if (arguments.length === 1 || typeof protocols === "undefined") {
        return new OriginalWebSocket(url);
      }
      return new OriginalWebSocket(url, protocols);
    }

    wrap.prototype = OriginalWebSocket.prototype;
    wrap.CONNECTING = OriginalWebSocket.CONNECTING;
    wrap.OPEN = OriginalWebSocket.OPEN;
    wrap.CLOSING = OriginalWebSocket.CLOSING;
    wrap.CLOSED = OriginalWebSocket.CLOSED;

    Object.defineProperty(wrap, "__PG_isPatched", { value: true });
    Object.defineProperty(wrap, "__PG_original", { value: OriginalWebSocket });

    window.WebSocket = wrap;

    if (
      "MozWebSocket" in window &&
      (window.MozWebSocket === OriginalWebSocket ||
        window.MozWebSocket === window.WebSocket.__PG_original)
    ) {
      window.MozWebSocket = wrap;
    }
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
    this.interceptWebSocket();

    // Enable URL cleaning runtime
    URLCleaningRuntime.init();

    // One full scan when the page is stable
    window.addEventListener("load", () =>
      this.scanNodeForBlockedElements(document.documentElement),
    );
  },
};

setShouldBlock((url) => PrivacyGuard.shouldBlock(url));
