import { MODE, CONFIG } from "../config.js";
import { BLOCKED_HOSTS, BLOCKED_RULES } from "../blocklist.js";
import { ALLOWED_HOSTS, ALLOWED_RULES, ALLOWED_SCHEMES } from "../allowlists.js";
import { EventLog } from "../event-log.js";
import { ImgPixelBlocker } from "../features/img-pixel-blocker.js";
import { URLCleaningRuntime, setShouldBlock } from "../url/runtime.js";

const TRUSTED_TYPES_ERROR_FRAGMENT = "TrustedScriptURL";

/**
 * Trusted Types helper: wraps script URLs only when Trusted Types are available.
 * @returns {{ wrapScriptURL: (value: unknown) => unknown }}
 */
const TT = (() => {
  const trustedTypesApi = globalThis.trustedTypes ?? null;
  let policy = null;

  /**
   * Produces a Trusted Types compatible script URL when possible.
   * @param {unknown} value - The candidate script URL.
   * @returns {unknown} - The wrapped TrustedScriptURL or the original value.
   */
  function wrapScriptURL(value) {
    if (!trustedTypesApi) {
      return value;
    }
    try {
      policy =
        policy ||
        trustedTypesApi.createPolicy("privacy-guard", {
          createScriptURL: String,
        });
      return policy.createScriptURL(String(value));
    } catch {
      return value;
    }
  }

  return { wrapScriptURL };
})();

/**
 * Determines whether the provided error represents a Trusted Types violation.
 * @param {unknown} error - The error thrown by a Trusted Types violation.
 * @returns {boolean} - True when the error indicates a Trusted Types violation.
 */
const isTrustedTypesViolation = (error) =>
  error instanceof TypeError &&
  typeof error.message === "string" &&
  error.message.includes(TRUSTED_TYPES_ERROR_FRAGMENT);

/**
 * Removes trailing dots from hostnames to normalize them for comparisons.
 * @param {string} value - The hostname to normalize.
 * @returns {string} - The normalized hostname.
 */
function normalizeHostname(value) {
  if (!value) {
    return "";
  }
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

/**
 * Checks whether the tail labels in a hostname match the provided pattern.
 * @param {string} hostname - The hostname to inspect.
 * @param {string} pattern - The pattern to compare against.
 * @returns {boolean} - True when the hostname matches the pattern.
 */
function hostnameLabelsMatch(hostname, pattern) {
  const hostParts = hostname.split(".");
  const patternParts = pattern.split(".");
  if (patternParts.length < 2 || patternParts.length > hostParts.length) {
    return false;
  }
  const tail = hostParts.slice(-patternParts.length).join(".");
  return tail === pattern;
}

/**
 * Handles Trusted Types violations by logging and neutralizing offending scripts.
 * @param {HTMLScriptElement | null} script - The script element that triggered the violation.
 * @param {unknown} value - The value attempted to be assigned to the script source.
 * @param {string} reason - The interception reason used for logging.
 * @param {{ neutralizeScript?: (element: HTMLScriptElement) => void } | null} guard - The guard instance managing scripts.
 */
function handleTrustedTypesViolation(script, value, reason, guard) {
  if (!script) {
    return;
  }
  try {
    EventLog.push({
      kind: "script",
      reason,
      url: typeof value === "string" ? value : String(value),
    });
  } catch {
    /* ignore */
  }
  try {
    script.removeAttribute("src");
  } catch {
    /* ignore */
  }
  if (guard && typeof guard.neutralizeScript === "function") {
    guard.neutralizeScript(script);
  }
}

/**
 * Checks if the hostname of a URL object matches any of the given patterns.
 * @param {URL} urlObj - The URL object to check.
 * @param {string[]} patterns - The patterns to match against.
 * @returns {boolean} - True if the hostname matches any pattern, false otherwise.
 */
function hostnameMatches(urlObj, patterns = []) {
  if (!urlObj || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  const host = (urlObj.hostname || "").toLowerCase();
  if (!host) {
    return false;
  }
  const hostNorm = normalizeHostname(host);

  return patterns.some((pattern) => {
    if (!pattern) {
      return false;
    }
    const pat = String(pattern).trim().toLowerCase();
    if (!pat || pat === "*") {
      return false;
    }

    const patNorm = normalizeHostname(pat);
    if (patNorm.startsWith("*.")) {
      const base = patNorm.slice(2);
      if (!base) {
        return false;
      }
      return hostNorm === base || hostnameLabelsMatch(hostNorm, base);
    }
    return hostNorm === patNorm || hostnameLabelsMatch(hostNorm, patNorm);
  });
}

/**
 * Checks if a URL object matches any of the given rules.
 * @param {URL} urlObj - The URL object to check.
 * @param {object[]} rules - The rules to match against. Each rule should be an object of shape: { host: string, pathStartsWith?: string }
 * @returns {boolean} - True if the URL matches any rule, false otherwise.
 */
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

/**
 * Returns the browser storage instance when available.
 * @returns {Storage | null} - The storage instance or null when unavailable.
 */
function getChannelStorage() {
  if (typeof globalThis !== "object" || globalThis === null) {
    return null;
  }
  const storage = Reflect.get(globalThis, "localStorage");
  if (!storage) {
    return null;
  }
  if (typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return null;
  }
  return storage;
}

const FEATURE_FLAG_STORAGE_KEY = "PG_featureFlags";
const SCRIPT_TAG_NAME = "SCRIPT";

/**
 * Retrieves the property descriptor for `HTMLScriptElement#src` when available.
 * @returns {PropertyDescriptor | null} - The descriptor or null if unavailable.
 */
function getScriptSrcDescriptor() {
  if (
    typeof HTMLScriptElement === "undefined" ||
    !HTMLScriptElement ||
    !HTMLScriptElement.prototype
  ) {
    return null;
  }
  return Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src") || null;
}

/**
 * Logs a blocked script event while swallowing logging failures.
 * @param {string} reason - The blocking reason identifier.
 * @param {unknown} value - The associated script URL or identifier.
 */
function logScriptBlock(reason, value) {
  try {
    EventLog.push({ kind: "script", reason, url: String(value ?? "") });
  } catch {
    /* ignore */
  }
}

/**
 * Schedules the provided callback on the microtask queue when available.
 * Falls back to a macrotask when microtasks are unavailable.
 * @param {() => void} callback - The callback to schedule.
 */
function scheduleMicrotask(callback) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  setTimeout(callback, 0);
}

/**
 * Adds DOM-style event emitter capabilities to the provided target object.
 * @param {object} target - The object to enhance with event emitter methods.
 */
function installEmitterMethods(target) {
  const listeners = new Map();

  target.addEventListener = function (type, handler) {
    const eventType = typeof type === "string" ? type : String(type || "");
    if (!eventType || typeof handler !== "function") {
      return;
    }
    const handlers = listeners.get(eventType) ?? [];
    handlers.push(handler);
    listeners.set(eventType, handlers);
  };

  target.removeEventListener = function (type, handler) {
    const eventType = typeof type === "string" ? type : String(type || "");
    if (!eventType || typeof handler !== "function") {
      return;
    }
    const handlers = listeners.get(eventType);
    if (!handlers) {
      return;
    }
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      if (handlers.length === 0) {
        listeners.delete(eventType);
      }
    }
  };

  target.dispatchEvent = function (event) {
    const eventType = typeof event?.type === "string" ? event.type : String(event?.type || "");
    if (!eventType) {
      return true;
    }

    let handled = false;
    const handlers = listeners.get(eventType);
    if (handlers) {
      const snapshot = [...handlers];
      for (const handler of snapshot) {
        try {
          handler.call(target, event);
          handled = true;
        } catch {
          /* ignore */
        }
      }
    }

    const propertyHandler = Reflect.get(target, `on${eventType}`);
    if (typeof propertyHandler === "function") {
      try {
        propertyHandler.call(target, event);
        handled = true;
      } catch {
        /* ignore */
      }
    }

    return handled;
  };
}

/**
 * Intercepts `Element#setAttribute` to neutralize blocked scripts.
 * @param {typeof PrivacyGuard} guard - The guard instance to delegate actions.
 */
function interceptScriptSetAttribute(guard) {
  if (typeof Element === "undefined" || !Element || !Element.prototype) {
    return;
  }
  const elementProto = Element.prototype;
  if (typeof elementProto.setAttribute !== "function") {
    return;
  }

  const originalSetAttribute = elementProto.setAttribute;
  const scriptSrcDescriptor = getScriptSrcDescriptor();
  const scriptSrcSetter = scriptSrcDescriptor?.set || null;

  elementProto.setAttribute = function (name, value) {
    const tagName = this && typeof this.tagName === "string" ? this.tagName.toUpperCase() : "";
    const attributeName = typeof name === "string" ? name.toLowerCase() : "";
    const isScriptElement = tagName === SCRIPT_TAG_NAME;
    const isSrcAttribute = attributeName === "src";

    if (!isScriptElement || !isSrcAttribute) {
      return Reflect.apply(originalSetAttribute, this, [name, value]);
    }

    if (guard.shouldBlock(value)) {
      logScriptBlock("setAttribute", value);
      guard.neutralizeScript(this);
      return;
    }

    if (!scriptSrcSetter) {
      try {
        return Reflect.apply(originalSetAttribute, this, [name, value]);
      } catch (error) {
        if (isTrustedTypesViolation(error)) {
          handleTrustedTypesViolation(this, value, "trustedtypes", guard);
          return;
        }
        throw error;
      }
    }

    try {
      Reflect.apply(scriptSrcSetter, this, [TT.wrapScriptURL(value)]);
    } catch (error) {
      if (isTrustedTypesViolation(error)) {
        handleTrustedTypesViolation(this, value, "trustedtypes", guard);
        return;
      }
      throw error;
    }
  };
}

/**
 * Patches `HTMLScriptElement#src` setter to enforce blocking and Trusted Types.
 * @param {typeof PrivacyGuard} guard - The guard instance to delegate actions.
 */
function patchScriptSrcSetter(guard) {
  const descriptor = getScriptSrcDescriptor();
  if (!descriptor || typeof descriptor.set !== "function") {
    return;
  }

  Object.defineProperty(HTMLScriptElement.prototype, "src", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) {
      try {
        if (guard.shouldBlock(value)) {
          logScriptBlock("prop:set", value);
          guard.neutralizeScript(this);
          return;
        }
      } catch {
        /* ignore */
      }
      try {
        Reflect.apply(descriptor.set, this, [TT.wrapScriptURL(value)]);
      } catch (error) {
        if (isTrustedTypesViolation(error)) {
          handleTrustedTypesViolation(this, value, "trustedtypes", guard);
          return;
        }
        throw error;
      }
    },
  });
}

/**
 * Hooks DOM insertion methods to inspect detached scripts before insertion.
 * @param {typeof PrivacyGuard} guard - The guard instance to delegate actions.
 */
function interceptDomInsertionForScripts(guard) {
  if (typeof Node === "undefined" || !Node || !Node.prototype) {
    return;
  }

  const patchAppendChild = () => {
    const originalAppendChild = Node.prototype.appendChild;
    if (typeof originalAppendChild !== "function") {
      return;
    }
    Node.prototype.appendChild = function (node, ...rest) {
      try {
        const tagName = node && typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
        if (tagName === SCRIPT_TAG_NAME) {
          const blockedUrl = node.getAttribute("src") || node.src || "";
          if (guard.shouldBlock(blockedUrl)) {
            logScriptBlock("dom:appendChild", blockedUrl);
            guard.neutralizeScript(node);
            return node;
          }
        }
      } catch {
        /* ignore */
      }
      return Reflect.apply(originalAppendChild, this, [node, ...rest]);
    };
  };

  const patchInsertBefore = () => {
    const originalInsertBefore = Node.prototype.insertBefore;
    if (typeof originalInsertBefore !== "function") {
      return;
    }
    Node.prototype.insertBefore = function (node, ...rest) {
      try {
        const tagName = node && typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
        if (tagName === SCRIPT_TAG_NAME) {
          const blockedUrl = node.getAttribute("src") || node.src || "";
          if (guard.shouldBlock(blockedUrl)) {
            logScriptBlock("dom:insertBefore", blockedUrl);
            guard.neutralizeScript(node);
            return node;
          }
        }
      } catch {
        /* ignore */
      }
      return Reflect.apply(originalInsertBefore, this, [node, ...rest]);
    };
  };

  patchAppendChild();
  patchInsertBefore();
}
export const PrivacyGuard = {
  STATE: {
    channelEnabled: {
      ws: true,
      sse: true,
    },
    featureEnabled: {
      imgPixels: true,
    },
  },

  imgPixelBlocker: new ImgPixelBlocker(),

  isChannelEnabled(kind) {
    if (!this.STATE || !this.STATE.channelEnabled) {
      return false;
    }
    if (kind === "ws") {
      return Boolean(this.STATE.channelEnabled.ws);
    }
    if (kind === "sse") {
      return Boolean(this.STATE.channelEnabled.sse);
    }
    return false;
  },

  isFeatureEnabled(feature) {
    if (!this.STATE || !this.STATE.featureEnabled) {
      return false;
    }
    if (feature === "imgPixels") {
      return Boolean(this.STATE.featureEnabled.imgPixels);
    }
    return false;
  },

  setChannelEnabled(kind, enabled) {
    if (!this.STATE || !this.STATE.channelEnabled) {
      return;
    }
    const next = Boolean(enabled);

    if (kind === "ws") {
      if (this.STATE.channelEnabled.ws === next) {
        return;
      }
      this.STATE.channelEnabled.ws = next;
    } else if (kind === "sse") {
      if (this.STATE.channelEnabled.sse === next) {
        return;
      }
      this.STATE.channelEnabled.sse = next;
    } else {
      return;
    }

    const storage = getChannelStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem("PG_channelEnabled", JSON.stringify(this.STATE.channelEnabled));
    } catch {
      /* ignore */
    }
  },

  loadChannelEnabled() {
    if (!this.STATE || !this.STATE.channelEnabled) {
      return;
    }
    const storage = getChannelStorage();
    if (!storage) {
      return;
    }
    try {
      const raw = storage.getItem("PG_channelEnabled");
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(parsed, "ws")) {
        this.STATE.channelEnabled.ws = Boolean(parsed.ws);
      }
      if (Object.prototype.hasOwnProperty.call(parsed, "sse")) {
        this.STATE.channelEnabled.sse = Boolean(parsed.sse);
      }
    } catch {
      /* ignore */
    }
  },

  setFeatureEnabled(feature, enabled) {
    if (!this.STATE || !this.STATE.featureEnabled) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(this.STATE.featureEnabled, feature)) {
      return;
    }
    const next = Boolean(enabled);
    if (this.STATE.featureEnabled[feature] === next) {
      return;
    }
    this.STATE.featureEnabled[feature] = next;
    this.applyFeatureState(feature);

    const storage = getChannelStorage();
    if (!storage) {
      return;
    }
    try {
      const payload = {};
      for (const key of Object.keys(this.STATE.featureEnabled)) {
        payload[key] = Boolean(this.STATE.featureEnabled[key]);
      }
      storage.setItem(FEATURE_FLAG_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  },

  loadFeatureFlags() {
    if (!this.STATE || !this.STATE.featureEnabled) {
      return;
    }
    const storage = getChannelStorage();
    if (!storage) {
      return;
    }
    try {
      const raw = storage.getItem(FEATURE_FLAG_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(parsed, "imgPixels")) {
        this.STATE.featureEnabled.imgPixels = Boolean(parsed.imgPixels);
      }
    } catch {
      /* ignore */
    }
  },

  applyFeatureState(feature) {
    if (!this.STATE || !this.STATE.featureEnabled) {
      return;
    }
    if (feature === "imgPixels") {
      if (this.STATE.featureEnabled.imgPixels) {
        this.imgPixelBlocker.enable({
          shouldBlock: (url) => this.shouldBlock(url),
          log: EventLog.push,
        });
      } else {
        this.imgPixelBlocker.disable();
      }
    }
  },

  applyAllFeatureStates() {
    if (!this.STATE || !this.STATE.featureEnabled) {
      return;
    }
    for (const feature of Object.keys(this.STATE.featureEnabled)) {
      this.applyFeatureState(feature);
    }
  },
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
    const scriptSrcDescriptor = getScriptSrcDescriptor();
    const scriptSrcSetter = scriptSrcDescriptor?.set || null;
    const scriptSrcGetter = scriptSrcDescriptor?.get || null;

    // Patch only script element creation to avoid breaking other element types
    document.createElement = function (...args) {
      const tagName = args[0] ? String(args[0]).toLowerCase() : "";
      const element = Reflect.apply(originalCreateElement, this, args);

      if (tagName === "script") {
        try {
          Object.defineProperty(element, "src", {
            configurable: true,
            enumerable: true,
            set(value) {
              try {
                if (PrivacyGuard.shouldBlock(value)) {
                  console.debug("[Privacy Guard] Prevented script creation:", value);
                  logScriptBlock("createElement", value);
                  this.setAttribute("type", "text/plain");
                  return;
                }
              } catch {
                /* ignore guard failures but still attempt assignment */
              }
              try {
                if (scriptSrcSetter) {
                  Reflect.apply(scriptSrcSetter, this, [TT.wrapScriptURL(value)]);
                  return;
                }
                return;
              } catch (error) {
                if (isTrustedTypesViolation(error)) {
                  handleTrustedTypesViolation(this, value, "trustedtypes", PrivacyGuard);
                  return;
                }
                throw error;
              }
            },
            get() {
              if (scriptSrcGetter) {
                return Reflect.apply(scriptSrcGetter, this, []);
              }
              return this.getAttribute("src");
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
    interceptScriptSetAttribute(PrivacyGuard);
    patchScriptSrcSetter(PrivacyGuard);
    interceptDomInsertionForScripts(PrivacyGuard);
  },

  /**
   * Neutralize a <script> element safely (prevents execution).
   * @param {HTMLScriptElement} el - The script element to neutralize.
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
    for (const el of elements) {
      if (this.shouldBlock(el.src)) {
        if (el.tagName === "SCRIPT") {
          this.neutralizeScript(el);
        } else {
          this.removeNode(el, el.tagName.toLowerCase());
        }
      }
    }
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

    const runPending = () => {
      scheduled = false;
      if (pending.size === 0) {
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
        if (roots.length > 0) {
          const filteredRoots = roots.filter((existing) => !node.contains(existing));
          roots.length = 0;
          roots.push(...filteredRoots);
        }
        roots.push(node);
      }

      pending.clear();

      if (roots.length === 0) {
        return;
      }

      for (const root of roots) {
        this.scanNodeForBlockedElements(root);
      }

      if (pending.size > 0) {
        schedule();
      }
    };

    const schedule = () => {
      if ("requestIdleCallback" in globalThis) {
        requestIdleCallback(runPending, { timeout: 50 });
      } else {
        requestAnimationFrame(runPending);
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

      if (!scheduled && pending.size > 0) {
        scheduled = true;
        schedule();
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const addedNodes = mutation.addedNodes || [];
        for (const added of addedNodes) {
          collectNode(added);
        }
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
    const originalFetch = typeof globalThis.fetch === "function" ? globalThis.fetch : null;
    if (!originalFetch) {
      return;
    }
    globalThis.fetch = function (...args) {
      const [input] = args;
      let url = "";
      if (typeof input === "string") {
        url = input;
      } else if (input && typeof input.url === "string") {
        url = input.url;
      } else if (
        input &&
        typeof input === "object" &&
        Object.prototype.hasOwnProperty.call(input, "url") &&
        input.url != null
      ) {
        url = String(input.url);
      }

      if (PrivacyGuard.shouldBlock(url)) {
        console.debug("[Privacy Guard] Blocked fetch:", url);
        EventLog.push({ kind: "fetch", reason: MODE.networkBlock, url: String(url) });
        if (MODE.networkBlock === "silent") {
          return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
        }
        return Promise.reject(new TypeError("PrivacyGuard blocked: " + url));
      }

      return Reflect.apply(originalFetch, this ?? globalThis, args);
    };
  },
  /**
   * Intercepts `navigator.sendBeacon` calls.
   */
  interceptBeacon() {
    const nav =
      typeof globalThis === "object" && globalThis ? Reflect.get(globalThis, "navigator") : null;
    if (!nav) {
      return;
    }
    const originalSendBeacon =
      typeof nav.sendBeacon === "function" ? nav.sendBeacon.bind(nav) : null;
    if (!originalSendBeacon) {
      return;
    }

    Reflect.set(nav, "sendBeacon", (url, data) => {
      if (PrivacyGuard.shouldBlock(url)) {
        console.debug("[Privacy Guard] Blocked beacon:", url);
        EventLog.push({ kind: "beacon", reason: "blocked", url: String(url) });
        // Indicate failure so sites don't assume it worked.
        return false;
      }
      return Reflect.apply(originalSendBeacon, nav, [url, data]);
    });
  },

  /**
   * Intercepts `XMLHttpRequest` to block requests.
   * This overrides `send` for a safer interception.
   */
  interceptXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const PRIVACY_GUARD_URL = Symbol("privacyGuardUrl");

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      // Store URL on a non-enumerable, collision-proof key
      try {
        Reflect.defineProperty(this, PRIVACY_GUARD_URL, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: url,
        });
      } catch {
        /* ignore */
      }
      Reflect.apply(originalOpen, this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      let requestUrl = null;
      try {
        requestUrl = Reflect.get(this, PRIVACY_GUARD_URL);
      } catch {
        requestUrl = null;
      }

      if (requestUrl && PrivacyGuard.shouldBlock(String(requestUrl))) {
        console.debug("[Privacy Guard] Blocked XHR:", requestUrl);
        EventLog.push({
          kind: "xhr",
          reason: MODE.networkBlock,
          url: String(requestUrl),
        });
        // Emulate real network failure: dispatch 'error' and 'abort', then 'loadend'
        scheduleMicrotask(() => {
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
        try {
          Reflect.deleteProperty(this, PRIVACY_GUARD_URL);
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        Reflect.apply(originalSend, this, args);
      } finally {
        try {
          Reflect.deleteProperty(this, PRIVACY_GUARD_URL);
        } catch {
          /* ignore */
        }
      }
    };
  },

  /**
   * Intercepts EventSource (SSE) connections.
   * Wraps the global EventSource constructor to block disallowed SSE connections.
   * @returns {void}
   */
  interceptEventSource() {
    const eventSourceCtor = Reflect.get(globalThis, "EventSource");
    if (!eventSourceCtor) {
      return;
    }
    if (eventSourceCtor.__PG_isPatched === true) {
      return;
    }

    const OriginalEventSource =
      (eventSourceCtor && eventSourceCtor.__PG_original) || eventSourceCtor;
    if (!OriginalEventSource) {
      return;
    }
    /**
     * Creates a blocked stub for the EventSource.
     * @param {string} urlString - The URL of the EventSource.
     * @param {"silent"|"error"} mode - The blocking mode ("silent" or "error").
     * @param {EventSourceInit|undefined} init - The initialization options for EventSource.
     * @returns {EventSource} - The blocked EventSource stub.
     */
    function createBlockedStub(urlString, mode, init) {
      const stub = Object.create(OriginalEventSource.prototype);
      installEmitterMethods(stub);

      stub.url = String(urlString);
      stub.withCredentials = Boolean(init && init.withCredentials);
      stub.readyState = OriginalEventSource.CLOSED;
      stub.close = function () {
        /* no-op */
      };

      if (mode !== "silent") {
        scheduleMicrotask(() => {
          try {
            stub.dispatchEvent(new Event("error"));
          } catch {
            /* ignore */
          }
        });
      }

      return stub;
    }

    /**
     * Wraps the EventSource constructor to block connections to URLs that should be blocked.
     * If the URL is blocked, returns a stub or throws an error depending on the blocking mode.
     * Otherwise, creates a real EventSource instance.
     * @param {string} url - The URL to connect to.
     * @param {EventSourceInit|undefined} [init] - Optional EventSource initialization options.
     * @returns {EventSource} - A real EventSource or a blocked stub.
     */
    function wrap(url, init) {
      if (!PrivacyGuard.isChannelEnabled("sse")) {
        return arguments.length === 1 || init === undefined
          ? new OriginalEventSource(url)
          : new OriginalEventSource(url, init);
      }
      const urlString = String(url);
      if (PrivacyGuard.shouldBlock(urlString)) {
        try {
          console.debug("[Privacy Guard] Blocked EventSource:", urlString);
        } catch {
          /* ignore */
        }
        try {
          EventLog.push({ kind: "sse", reason: MODE.networkBlock, url: urlString });
        } catch {
          /* ignore */
        }

        if (MODE.networkBlock === "silent") {
          return createBlockedStub(urlString, "silent", init);
        }

        throw new TypeError("PrivacyGuard blocked EventSource: " + urlString);
      }

      if (arguments.length === 1 || init === undefined) {
        return new OriginalEventSource(url);
      }
      return new OriginalEventSource(url, init);
    }

    wrap.prototype = OriginalEventSource.prototype;
    wrap.CONNECTING = OriginalEventSource.CONNECTING;
    wrap.OPEN = OriginalEventSource.OPEN;
    wrap.CLOSED = OriginalEventSource.CLOSED;

    Object.defineProperty(wrap, "__PG_isPatched", { value: true });
    Object.defineProperty(wrap, "__PG_original", { value: OriginalEventSource });

    Reflect.set(globalThis, "EventSource", wrap);
  },

  /**
   * Intercepts WebSocket connections.
   * Wraps the global WebSocket constructor to block connections targeting disallowed URLs.
   * Creates blocked stubs or throws errors according to the configured network blocking mode.
   * @returns {void}
   */
  interceptWebSocket() {
    const webSocketCtor = Reflect.get(globalThis, "WebSocket");
    if (!webSocketCtor) {
      return;
    }
    if (webSocketCtor.__PG_isPatched === true) {
      return;
    }

    const OriginalWebSocket = (webSocketCtor && webSocketCtor.__PG_original) || webSocketCtor;
    if (!OriginalWebSocket) {
      return;
    }

    const canCloseEvent = typeof CloseEvent === "function";

    /**
     * Dispatches a 'close' event on the given WebSocket stub, optionally indicating if the connection was clean.
     * @param {object} target - The WebSocket stub object to dispatch the event on.
     * @param {boolean} wasClean - Whether the connection was closed cleanly.
     */
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

    /**
     * Creates a blocked stub for the WebSocket connection.
     * @param {string} url - The URL of the WebSocket.
     * @param {"silent"|"error"} mode - The blocking mode ("silent" or "error").
     * @returns {WebSocket} - The blocked WebSocket stub.
     */
    function createBlockedStub(url, mode) {
      const stub = Object.create(OriginalWebSocket.prototype);
      installEmitterMethods(stub);

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

      scheduleMicrotask(() => {
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

    /**
     * Wraps the WebSocket constructor to block connections to URLs that should be blocked.
     * If the URL is blocked, returns a stub or throws an error depending on the blocking mode.
     * Otherwise, creates a real WebSocket instance.
     * @param {string} url - The URL to connect to.
     * @param {string|string[]} [protocols] - Optional subprotocols for the WebSocket connection.
     * @returns {WebSocket} - A real WebSocket or a blocked stub.
     */
    function wrap(url, protocols) {
      if (!PrivacyGuard.isChannelEnabled("ws")) {
        return arguments.length === 1 || protocols === undefined
          ? new OriginalWebSocket(url)
          : new OriginalWebSocket(url, protocols);
      }
      const urlString = String(url);
      if (PrivacyGuard.shouldBlock(urlString)) {
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

      if (arguments.length === 1 || protocols === undefined) {
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

    Reflect.set(globalThis, "WebSocket", wrap);

    const mozWebSocket = Reflect.get(globalThis, "MozWebSocket");
    const currentWebSocket = Reflect.get(globalThis, "WebSocket");
    if (
      mozWebSocket &&
      (mozWebSocket === OriginalWebSocket ||
        (currentWebSocket && mozWebSocket === currentWebSocket.__PG_original))
    ) {
      Reflect.set(globalThis, "MozWebSocket", wrap);
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

    this.loadChannelEnabled();
    this.loadFeatureFlags();
    this.applyAllFeatureStates();

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
    this.interceptEventSource();
    this.interceptWebSocket();

    // Enable URL cleaning runtime
    URLCleaningRuntime.init();

    // One full scan when the page is stable
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("load", () =>
        this.scanNodeForBlockedElements(document.documentElement),
      );
    }
  },
};

setShouldBlock((url) => PrivacyGuard.shouldBlock(url));
