/**
 * Intercepts image source changes to prevent tracker beacons from loading.
 */
export class ImgPixelBlocker {
  enabled = false;

  origSrcDescriptor = null;

  origSrcsetDescriptor = null;

  origSetAttribute = null;

  deps = null;

  /**
   * Enables the interceptor when dependencies are available.
   * @param {{ shouldBlock: (url: string) => boolean, log?: (event: { kind: string, reason: string, url: string }) => void }} deps - Runtime services.
   * @returns {void}
   */
  enable(deps) {
    if (this.enabled) {
      return;
    }
    if (!deps || typeof deps.shouldBlock !== "function") {
      return;
    }

    this.enabled = true;
    this.deps = {
      shouldBlock: deps.shouldBlock,
      log: typeof deps.log === "function" ? deps.log : null,
    };

    const boundShouldBlockValue = this.shouldBlockValue.bind(this);
    const boundShouldBlockSrcset = this.shouldBlockSrcset.bind(this);

    const srcDescriptor = this.getDescriptor(HTMLImageElement, "src");
    if (srcDescriptor && typeof srcDescriptor.set === "function") {
      const originalSetter = srcDescriptor.set;
      const originalGetter = srcDescriptor.get;
      this.origSrcDescriptor = srcDescriptor;
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: true,
        enumerable: srcDescriptor.enumerable ?? true,
        get: originalGetter,
        set(value) {
          try {
            if (boundShouldBlockValue(this, value, "src")) {
              return;
            }
          } catch {
            /* ignore */
          }
          Reflect.apply(originalSetter, this, [value]);
        },
      });
    }

    const srcsetDescriptor = this.getDescriptor(HTMLImageElement, "srcset");
    if (srcsetDescriptor && typeof srcsetDescriptor.set === "function") {
      const originalSetter = srcsetDescriptor.set;
      const originalGetter = srcsetDescriptor.get;
      this.origSrcsetDescriptor = srcsetDescriptor;
      Object.defineProperty(HTMLImageElement.prototype, "srcset", {
        configurable: true,
        enumerable: srcsetDescriptor.enumerable ?? true,
        get: originalGetter,
        set(value) {
          try {
            if (boundShouldBlockSrcset(this, value)) {
              return;
            }
          } catch {
            /* ignore */
          }
          Reflect.apply(originalSetter, this, [value]);
        },
      });
    }

    const originalSetAttribute = Element.prototype.setAttribute;
    if (typeof originalSetAttribute === "function") {
      this.origSetAttribute = originalSetAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (this instanceof HTMLImageElement) {
          const attr = String(name).toLowerCase();
          try {
            if (attr === "src" && boundShouldBlockValue(this, value, "setAttribute")) {
              return;
            }
            if (attr === "srcset" && boundShouldBlockSrcset(this, value)) {
              return;
            }
          } catch {
            /* ignore */
          }
        }
        Reflect.apply(originalSetAttribute, this, [name, value]);
      };
    }
  }

  /**
   * Restores original descriptors and removes hooks.
   * @returns {void}
   */
  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;
    this.deps = null;

    if (this.origSrcDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, "src", this.origSrcDescriptor);
      this.origSrcDescriptor = null;
    }
    if (this.origSrcsetDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, "srcset", this.origSrcsetDescriptor);
      this.origSrcsetDescriptor = null;
    }
    if (this.origSetAttribute) {
      Element.prototype.setAttribute = this.origSetAttribute;
      this.origSetAttribute = null;
    }
  }

  /**
   * Determines whether the blocker is currently active.
   * @returns {boolean} True when interception is enabled.
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Attempts to block a src assignment using the provided dependencies.
   * @param {Element} element - Target element.
   * @param {unknown} value - Original assigned value.
   * @param {"src" | "setAttribute"} reason - Reason identifier for logging.
   * @returns {boolean} True when the assignment should be aborted.
   */
  shouldBlockValue(element, value, reason) {
    if (!this.enabled || !this.deps || typeof this.deps.shouldBlock !== "function") {
      return false;
    }
    const resolved = this.resolveUrl(element, value);
    let blocked = false;
    try {
      blocked = this.deps.shouldBlock(resolved);
    } catch {
      blocked = false;
    }
    if (!blocked) {
      return false;
    }
    this.log(reason, resolved);
    return true;
  }

  /**
   * Determines whether any candidate URL inside a srcset should be blocked.
   * @param {Element} element - Target image element.
   * @param {unknown} value - Raw srcset value.
   * @returns {boolean} True when the assignment should be cancelled.
   */
  shouldBlockSrcset(element, value) {
    if (!this.enabled || !this.deps || typeof this.deps.shouldBlock !== "function") {
      return false;
    }
    const raw = value === undefined || value === null ? "" : String(value);
    const candidates = raw
      .split(",")
      .map((item) => item.trim().split(/\s+/)[0])
      .filter(Boolean);
    for (const candidate of candidates) {
      const resolved = this.resolveUrl(element, candidate);
      let blocked = false;
      try {
        blocked = this.deps.shouldBlock(resolved);
      } catch {
        blocked = false;
      }
      if (blocked) {
        this.log("srcset", resolved);
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves the descriptor for a specific property when possible.
   * @param {typeof HTMLImageElement} Ctor - Constructor reference.
   * @param {string} key - Property name.
   * @returns {PropertyDescriptor | null} Found descriptor or null.
   */
  getDescriptor(Ctor, key) {
    if (Ctor === undefined || !Ctor || !Ctor.prototype) {
      return null;
    }
    return Object.getOwnPropertyDescriptor(Ctor.prototype, key) || null;
  }

  /**
   * Converts a value to an absolute URL string relative to the element/document.
   * @param {Element | null | undefined} element - Context element.
   * @param {unknown} value - Candidate URL.
   * @returns {string} Normalized URL string.
   */
  resolveUrl(element, value) {
    const str = value === undefined || value === null ? "" : String(value);
    let base = null;
    if (element && typeof element === "object") {
      const owner = element.ownerDocument;
      if (owner && typeof owner.baseURI === "string") {
        base = owner.baseURI;
      }
    }
    if (
      !base &&
      typeof document !== "undefined" &&
      document &&
      typeof document.baseURI === "string"
    ) {
      base = document.baseURI;
    }
    try {
      if (base) {
        return new URL(str, base).toString();
      }
      return new URL(str, location.href).toString();
    } catch {
      return str;
    }
  }

  /**
   * Emits a log entry when available.
   * @param {"src" | "setAttribute" | "srcset"} reason - Blocking reason.
   * @param {string} url - Blocked URL.
   * @returns {void}
   */
  log(reason, url) {
    if (!this.deps || typeof this.deps.log !== "function") {
      return;
    }
    try {
      this.deps.log({ kind: "img", reason, url });
    } catch {
      /* ignore */
    }
  }
}
