import { EventLog } from "../event-log.js";
import { URLCleaner } from "./cleaner.js";

let shouldBlockImpl = null;
let imageConstructorPatched = false;
let imageSrcSetterPatched = false;
let imageSrcsetSetterPatched = false;

/**
 * Replaces the current history entry with a cleaned version of location.href.
 * Runs at module evaluation time to capture tracking parameters before third parties do.
 * @returns {void}
 */
function cleanInitialLocation() {
  if (typeof location === "undefined" || typeof history === "undefined") {
    return;
  }
  const protocol = location.protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    return;
  }
  try {
    const originalHref = location.href;
    const cleanedHref = URLCleaner.cleanHref(originalHref);
    if (cleanedHref && cleanedHref !== originalHref && typeof history.replaceState === "function") {
      history.replaceState(history.state, document.title, cleanedHref);
    }
  } catch {
    /* ignore */
  }
}

cleanInitialLocation();

/**
 * Determines whether the current shouldBlock predicate blocks the provided URL.
 * @param {string} url - URL to evaluate.
 * @returns {boolean} - True when the predicate blocks the URL.
 */
function isBlockedUrl(url) {
  if (typeof shouldBlockImpl !== "function") {
    return false;
  }
  try {
    return shouldBlockImpl(url);
  } catch {
    return false;
  }
}

/**
 * Applies hardened defaults to newly created image instances.
 * @param {HTMLImageElement | null | undefined} img - Image instance to harden.
 * @returns {HTMLImageElement | null | undefined} - The same image instance.
 */
function primeImageInstance(img) {
  if (!img) {
    return img;
  }
  try {
    if (!img.referrerPolicy) {
      img.referrerPolicy = "no-referrer";
    }
  } catch {
    /* ignore */
  }
  return img;
}

/**
 * Retrieves the global HTML image prototype when available.
 * @returns {HTMLImageElement["prototype"] | null} - Prototype or null when unsupported.
 */
function getImagePrototype() {
  if (typeof HTMLImageElement === "undefined" || !HTMLImageElement) {
    return null;
  }
  return HTMLImageElement.prototype;
}

/**
 * Normalizes an image URL and determines whether it should be blocked.
 * @param {string} raw - Original src value provided by the page.
 * @param {Element | null | undefined} element - The image element receiving the URL.
 * @returns {string | null} - Cleaned URL when allowed, or null when the URL is blocked.
 */
function sanitizeImageUrl(raw, element) {
  let cleanedValue;
  try {
    cleanedValue = URLCleaner.cleanHref(raw, element?.baseURI);
  } catch {
    cleanedValue = raw;
  }
  if (!isBlockedUrl(cleanedValue)) {
    return cleanedValue;
  }
  try {
    EventLog.push({ kind: "image", reason: "block", url: cleanedValue });
  } catch {
    /* ignore */
  }
  try {
    console.debug("[Privacy Guard] Blocked image beacon:", cleanedValue);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Wraps the global Image constructor so new pixels inherit hardened defaults.
 * @returns {void}
 */
function patchImageConstructor() {
  if (imageConstructorPatched) {
    return;
  }
  imageConstructorPatched = true;
  try {
    const ImageCtor = Reflect.get(globalThis, "Image");
    if (typeof ImageCtor !== "function" || ImageCtor.__PG_isPatched) {
      return;
    }
    const WrappedImage = function Image(...args) {
      const instance = Reflect.construct(ImageCtor, args, new.target || WrappedImage);
      return primeImageInstance(instance);
    };
    Object.setPrototypeOf(WrappedImage, ImageCtor);
    WrappedImage.prototype = ImageCtor.prototype;
    Object.defineProperty(WrappedImage, "__PG_original", { value: ImageCtor });
    Object.defineProperty(WrappedImage, "__PG_isPatched", { value: true });
    Reflect.set(globalThis, "Image", WrappedImage);
  } catch {
    /* ignore */
  }
}

/**
 * Wraps `HTMLImageElement#src` to sanitize and optionally block beacons.
 * @param {HTMLImageElement["prototype"]} imagePrototype - Image prototype to patch.
 * @returns {void}
 */
function patchImageSrc(imagePrototype) {
  if (imageSrcSetterPatched) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(imagePrototype, "src");
  if (!descriptor || typeof descriptor.set !== "function") {
    imageSrcSetterPatched = true;
    return;
  }
  const originalSet = descriptor.set;
  const originalGet = descriptor.get;
  const sanitizedSetter = function setSanitizedSrc(value) {
    if (value == null) {
      return Reflect.apply(originalSet, this, [value]);
    }
    const raw = typeof value === "string" ? value : String(value);
    const cleaned = sanitizeImageUrl(raw, this);
    if (cleaned === null) {
      try {
        this.removeAttribute("src");
      } catch {
        /* ignore */
      }
      return;
    }
    return Reflect.apply(originalSet, this, [cleaned]);
  };
  Object.defineProperty(imagePrototype, "src", {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get: originalGet,
    set: sanitizedSetter,
  });
  imageSrcSetterPatched = true;
}

/**
 * Wraps `HTMLImageElement#srcset` to normalize every URL inside srcset lists.
 * @param {HTMLImageElement["prototype"]} imagePrototype - Image prototype to patch.
 * @param {(value: string) => string} cleanSrcset - Cleaner function for srcset strings.
 * @returns {void}
 */
function patchImageSrcset(imagePrototype, cleanSrcset) {
  if (imageSrcsetSetterPatched) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(imagePrototype, "srcset");
  if (!descriptor || typeof descriptor.set !== "function") {
    imageSrcsetSetterPatched = true;
    return;
  }
  const originalSet = descriptor.set;
  const originalGet = descriptor.get;
  const sanitizedSetter = function setSanitizedSrcset(value) {
    if (typeof value !== "string") {
      return Reflect.apply(originalSet, this, [value]);
    }
    const cleanedValue = cleanSrcset(value);
    return Reflect.apply(originalSet, this, [cleanedValue]);
  };
  Object.defineProperty(imagePrototype, "srcset", {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get: originalGet,
    set: sanitizedSetter,
  });
  imageSrcsetSetterPatched = true;
}

/**
 * Creates a snapshot of an element's mutable attributes prior to rewriting URLs.
 * @param {Element} el - Element to snapshot.
 * @returns {{ className: string, dataAttributes: [string, string][] }} Snapshot payload.
 */
function snapshotElementState(el) {
  const dataAttributes = [];
  for (const attribute of el.attributes) {
    if (attribute.name.startsWith("data-") && attribute.name !== "data-privacy-guard-cleaned") {
      dataAttributes.push([attribute.name, attribute.value]);
    }
  }
  return { className: el.className, dataAttributes };
}

/**
 * Restores previously captured element attributes after rewriting.
 * @param {Element} el - Element to restore.
 * @param {{ className: string, dataAttributes: [string, string][] }} snapshot - Snapshot data.
 * @returns {void}
 */
function restoreElementState(el, snapshot) {
  if (!snapshot) {
    return;
  }
  const { className, dataAttributes } = snapshot;
  if (className && el.className !== className) {
    el.className = className;
  }
  for (const [name, value] of dataAttributes) {
    if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }
}

/**
 * Handles anchor-specific rewrite logic, including neutralization and block state tracking.
 * @param {Element} el - Anchor element being rewritten.
 * @param {string} attr - Attribute name being processed.
 * @param {unknown} cleaned - Cleaned attribute value.
 * @param {boolean} force - Whether the rewrite is being forced.
 * @returns {boolean} - True when the anchor was fully handled (neutralized).
 */
function handleAnchorRewrite(el, attr, cleaned, force) {
  if (el.tagName !== "A") {
    return false;
  }
  const cleanedString = typeof cleaned === "string" ? cleaned : "";
  const blocked = cleanedString === "about:blank" || (cleanedString && isBlockedUrl(cleanedString));
  if (!blocked) {
    if (el.dataset.pgBlock) {
      delete el.dataset.pgBlock;
    }
    return false;
  }
  try {
    el.removeAttribute("target");
  } catch {
    /* ignore */
  }
  el.dataset.pgBlock = "1";
  const snapshot = snapshotElementState(el);
  el.setAttribute(attr, "#");
  restoreElementState(el, snapshot);
  if (!force) {
    el.dataset.privacyGuardCleaned = "1";
  }
  return true;
}

/**
 * Safely creates a URL instance, attempting optional base fallbacks for relative inputs.
 * @param {unknown} value - URL candidate to parse.
 * @param {string[]} bases - Optional base URLs used when value is relative.
 * @returns {URL | null} - Parsed URL instance or null when parsing fails.
 */
function tryCreateUrl(value, bases = []) {
  if (typeof value !== "string" || !value || value === "about:blank") {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    for (const base of bases) {
      if (typeof base !== "string" || !base || base === "about:blank") {
        continue;
      }
      try {
        return new URL(value, base);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * Resolves a base URL whose origin matches the cleaned target.
 * @param {Element} el - Anchor element being processed.
 * @param {string} cleanedValue - Cleaned attribute value.
 * @returns {{ baseHref: string, cleanedUrl: URL | null }} - Matching base info.
 */
function resolveMatchingBase(el, cleanedValue) {
  const locationHref = typeof location === "undefined" ? "" : location.href;
  const docBase = typeof document === "undefined" ? "" : document.baseURI;
  const candidateBases = [locationHref, el.baseURI, docBase];
  const cleanedUrl = tryCreateUrl(cleanedValue, candidateBases);
  if (cleanedUrl) {
    for (const candidate of candidateBases) {
      const baseUrl = tryCreateUrl(candidate);
      if (baseUrl && cleanedUrl.origin === baseUrl.origin) {
        return { baseHref: baseUrl.href, cleanedUrl };
      }
    }
  }
  return { baseHref: "", cleanedUrl };
}

/**
 * Preserves relative anchor hrefs when the cleaned target resolves within the same origin.
 * @param {Element} el - Anchor being processed.
 * @param {string} attr - Attribute under rewrite.
 * @param {unknown} originalValue - Original attribute value.
 * @param {unknown} cleanedValue - Candidate rewritten value.
 * @returns {unknown} - Potentially relativized attribute value.
 */
function relativizeSameOriginAnchorHref(el, attr, originalValue, cleanedValue) {
  const originalHref =
    typeof originalValue === "string" ? originalValue : String(originalValue ?? "");
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(originalHref);
  const isProtocolRelative = originalHref.startsWith("//");
  const shouldSkip =
    attr !== "href" || el.tagName !== "A" || !originalHref || hasScheme || isProtocolRelative;
  if (shouldSkip) {
    return cleanedValue;
  }
  if (typeof cleanedValue === "string" && cleanedValue.length > 0) {
    const { baseHref, cleanedUrl } = resolveMatchingBase(el, cleanedValue);
    if (baseHref && cleanedUrl) {
      return `${cleanedUrl.pathname}${cleanedUrl.search}${cleanedUrl.hash}`;
    }
  }
  return cleanedValue;
}

/**
 * Cleans navigation-triggering anchors before clicks open them.
 * @this {typeof URLCleaningRuntime}
 * @param {MouseEvent} e - Click event dispatched by the document.
 * @returns {void}
 */
function handleNavigationEvent(e) {
  const anchor = e.target && (e.target.closest ? e.target.closest("a[href]") : null);
  if (!anchor) {
    return;
  }
  if (e.type === "auxclick" && e.button !== 1) {
    return;
  }
  this.rewriteElAttr(anchor, "href", { force: true });
  const href = anchor.getAttribute("href") || "";
  const shouldCheck = href && !href.startsWith("#");
  const blocked =
    anchor.dataset.pgBlock === "1" || href === "about:blank" || (shouldCheck && isBlockedUrl(href));
  if (blocked) {
    e.preventDefault();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
    e.stopPropagation();
  }
}

const SWEEP_SELECTOR = "a[href], img[src], img[srcset], form[action], link[rel][href]";
const OBSERVED_ATTRIBUTE_NAMES = ["href", "src", "srcset", "action", "rel", "ping"];
const OBSERVED_ATTRIBUTES = new Set(OBSERVED_ATTRIBUTE_NAMES);

/**
 * Normalizes the URL argument used for History API wrappers.
 * @param {unknown} url - Proposed URL argument.
 * @returns {unknown} - Cleaned URL when possible, or the original value.
 */
function sanitizeHistoryArgument(url) {
  if (typeof url !== "string") {
    return url;
  }
  try {
    return URLCleaner.cleanHref(url);
  } catch {
    return url;
  }
}

/**
 * Wraps `history.pushState` to clean URL arguments.
 * @returns {void}
 */
function ensurePatchedPushState() {
  const original = history.pushState;
  if (typeof original !== "function" || original.__PG_wrapped) {
    return;
  }
  const wrapped = function pushState(state, title, url) {
    const sanitizedUrl = sanitizeHistoryArgument(url);
    return Reflect.apply(original, this, [state, title, sanitizedUrl]);
  };
  Object.defineProperty(wrapped, "__PG_wrapped", { value: true });
  Object.defineProperty(wrapped, "__PG_original", { value: original });
  history.pushState = wrapped;
}

/**
 * Wraps `history.replaceState` to clean URL arguments.
 * @returns {void}
 */
function ensurePatchedReplaceState() {
  const original = history.replaceState;
  if (typeof original !== "function" || original.__PG_wrapped) {
    return;
  }
  const wrapped = function replaceState(state, title, url) {
    const sanitizedUrl = sanitizeHistoryArgument(url);
    return Reflect.apply(original, this, [state, title, sanitizedUrl]);
  };
  Object.defineProperty(wrapped, "__PG_wrapped", { value: true });
  Object.defineProperty(wrapped, "__PG_original", { value: original });
  history.replaceState = wrapped;
}

/**
 * Processes an element discovered during DOM sweeps based on its tag name.
 * @param {typeof URLCleaningRuntime} runtime - Runtime instance.
 * @param {Element} el - Element to normalize.
 * @returns {void}
 */
function processSweepTarget(runtime, el) {
  const tagName = el.tagName;
  switch (tagName) {
    case "A": {
      runtime.rewriteElAttr(el, "href");
      runtime.hardenAnchor(el);
      break;
    }
    case "IMG": {
      runtime.rewriteElAttr(el, "src");
      if (el.hasAttribute("srcset")) {
        const before = el.getAttribute("srcset") || "";
        const after = runtime.cleanSrcset(before);
        if (after !== before) {
          el.setAttribute("srcset", after);
        }
      }
      break;
    }
    case "FORM": {
      runtime.rewriteElAttr(el, "action");
      break;
    }
    case "LINK": {
      runtime.maybeNeutralizeLinkEl(el);
      break;
    }
    default: {
      break;
    }
  }
}

/**
 * Returns true when the provided node is an Element.
 * @param {Node} node - Candidate node.
 * @returns {node is Element} - Whether the node is an Element.
 */
function isElementNode(node) {
  return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
}

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
  shouldBlockImpl = null;
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
      a.setAttribute("rel", [...parts].join(" "));
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
      if (isBlockedUrl(href)) {
        linkEl.remove();
        return;
      }
      // if not blocked, at least clean the href
      const cleaned = URLCleaner.cleanHref(href, linkEl.baseURI);
      if (cleaned !== href) {
        linkEl.setAttribute("href", cleaned);
      }
      // mark element as processed to avoid repeated work
      try {
        linkEl.dataset.privacyGuardCleaned = "1";
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  },

  // Rewrite a single element in-place if attribute exists
  rewriteElAttr(el, attr, opts = {}) {
    if (!el) {
      return;
    }
    const force = Boolean(opts && opts.force);
    const current = el.getAttribute(attr);
    if (!current) {
      return;
    }
    if (!force && el.dataset.privacyGuardCleaned === "1") {
      return;
    }

    let cleaned;
    try {
      cleaned = URLCleaner.cleanHref(current, el.baseURI);
    } catch {
      cleaned = current;
    }

    if (handleAnchorRewrite(el, attr, cleaned, force)) {
      return;
    }

    cleaned = relativizeSameOriginAnchorHref(el, attr, current, cleaned);

    if (!cleaned || cleaned === current) {
      if (!force) {
        el.dataset.privacyGuardCleaned = "1";
      }
      return;
    }

    const snapshot = snapshotElementState(el);
    el.setAttribute(attr, cleaned);
    restoreElementState(el, snapshot);
    if (!force) {
      el.dataset.privacyGuardCleaned = "1";
    }
  },

  // Initial and incremental sweeps
  sweep(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    // Only scan relevant elements
    for (const el of root.querySelectorAll(SWEEP_SELECTOR)) {
      if (el.dataset.privacyGuardCleaned === "1") {
        continue;
      }
      processSweepTarget(this, el);
    }
  },

  // Intercept clicks to ensure last-moment cleaning (covers dynamic href)
  interceptClicks() {
    const handler = handleNavigationEvent.bind(this);
    document.addEventListener("click", handler, { capture: true, passive: false });
    document.addEventListener("auxclick", handler, { capture: true, passive: false });
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
    ensurePatchedPushState();
    ensurePatchedReplaceState();

    // Also react to popstate-driven navigations by sweeping DOM
    globalThis.addEventListener("popstate", () => {
      this.sweep(document);
    });
  },

  // Observe added nodes; filter to relevant elements for performance
  observeMutations() {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (isElementNode(node)) {
            this.sweep(node);
          }
        }
        if (
          record.type === "attributes" &&
          isElementNode(record.target) &&
          OBSERVED_ATTRIBUTES.has(record.attributeName)
        ) {
          try {
            delete record.target.dataset.privacyGuardCleaned;
          } catch {
            /* noop: dataset entry may be read-only */
          }
          this.sweep(record.target);
        }
      }
    });

    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTE_NAMES,
    });
  },

  // Intercept navigations triggered via JS APIs to ensure cleaned URLs
  interceptNavigation() {
    try {
      // window.open
      const _open = window.open;
      if (typeof _open === "function") {
        window.open = function openWrapped(url, name, specs) {
          let sanitized = url;
          if (typeof sanitized === "string") {
            try {
              sanitized = URLCleaner.cleanHref(sanitized);
            } catch {
              sanitized = url;
            }
            if (sanitized === "about:blank" || isBlockedUrl(sanitized)) {
              return { closed: true, close() {}, focus() {}, blur() {} };
            }
          }
          return Reflect.apply(_open, globalThis, [sanitized, name, specs]);
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
        locationPrototype.assign = function assignWrapped(url) {
          let sanitized = url;
          if (typeof sanitized === "string") {
            try {
              sanitized = URLCleaner.cleanHref(sanitized);
            } catch {
              sanitized = url;
            }
          }
          return Reflect.apply(_assign, this, [sanitized]);
        };
      }
      if (locationPrototype && locationPrototype.replace) {
        const _replace = locationPrototype.replace;
        locationPrototype.replace = function replaceWrapped(url) {
          let sanitized = url;
          if (typeof sanitized === "string") {
            try {
              sanitized = URLCleaner.cleanHref(sanitized);
            } catch {
              sanitized = url;
            }
          }
          return Reflect.apply(_replace, this, [sanitized]);
        };
      }
    } catch {
      /* ignore */
    }
  },

  interceptImages() {
    patchImageConstructor();
    const imagePrototype = getImagePrototype();
    if (!imagePrototype) {
      return;
    }
    patchImageSrc(imagePrototype);
    patchImageSrcset(imagePrototype, (value) => this.cleanSrcset(value));
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
    this.interceptImages();
    // Final pass on full load (late-injected links)
    window.addEventListener("load", () => this.sweep(document));
  },
};

// Ensure YouTube SPA URLs stay canonical (strip start_radio, share junk, etc.)
(function canonicalizeYouTubeSPA() {
  try {
    const host = location.hostname;
    const isYouTubeHost =
      /(?:^|\.)youtube\.com$/i.test(host) || /(?:^|\.)youtube-nocookie\.com$/i.test(host);
    if (!isYouTubeHost) {
      return;
    }

    let busy = false;

    /**
     * Normalizes the active YouTube SPA URL by replacing history entries with a cleaned variant.
     * @returns {void}
     */
    function cleanLocationHref() {
      if (busy) {
        return;
      }
      try {
        busy = true;
        const cleaned = URLCleaner.cleanHref(location.href);
        if (cleaned && cleaned !== location.href) {
          history.replaceState(history.state, document.title, cleaned);
        }
      } catch {
        /* ignore */
      } finally {
        busy = false;
      }
    }

    /**
     * Wraps a History API method for YouTube SPA canonicalization.
     * @param {() => typeof history.pushState} getOriginal - Getter for the current method.
     * @param {(wrapped: typeof history.pushState) => void} assignWrapped - Setter to install the wrapped method.
     * @returns {void}
     */
    function wrapHistoryMethodForYouTube(getOriginal, assignWrapped) {
      const original = getOriginal();
      if (typeof original !== "function" || original.__PG_wrapped) {
        return;
      }
      const wrapped = function youtubeHistoryWrapper(state, title, url) {
        let sanitized = url;
        if (typeof sanitized === "string") {
          try {
            sanitized = URLCleaner.cleanHref(sanitized, location.href);
          } catch {
            sanitized = url;
          }
        }
        return Reflect.apply(original, this, [state, title, sanitized]);
      };
      Object.defineProperty(wrapped, "__PG_wrapped", { value: true });
      Object.defineProperty(wrapped, "__PG_original", { value: original });
      assignWrapped(wrapped);
    }

    wrapHistoryMethodForYouTube(
      () => history.pushState,
      (wrapped) => {
        history.pushState = wrapped;
      },
    );

    wrapHistoryMethodForYouTube(
      () => history.replaceState,
      (wrapped) => {
        history.replaceState = wrapped;
      },
    );

    const events = ["yt-navigate-finish", "yt-page-data-updated", "popstate", "hashchange"];
    for (const eventName of events) {
      globalThis.addEventListener(eventName, cleanLocationHref);
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
      cleanLocationHref();
    } else {
      document.addEventListener("DOMContentLoaded", cleanLocationHref, { once: true });
    }

    setTimeout(cleanLocationHref, 0);
  } catch {
    /* ignore */
  }
})();
