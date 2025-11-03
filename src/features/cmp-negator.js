const CMP_VENDOR_PATTERN =
  /\b(?:cmp|consent(?:manager)?|cookie(?:bot|law)|didomi|onetrust|quantcast|sourcepoint|trustarc|privacymanagers?|usercentrics)\b/i;

const DEFAULT_TCF_PAYLOAD = Object.freeze({
  gdprApplies: true,
  tcfPolicyVersion: 2,
  cmpStatus: "loaded",
  eventStatus: "tcloaded",
  tcString: "",
  purpose: {
    consents: Object.freeze(Object.create(null)),
    legitimateInterests: Object.freeze(Object.create(null)),
  },
  vendor: {
    consents: Object.freeze(Object.create(null)),
    legitimateInterests: Object.freeze(Object.create(null)),
  },
});

const TCF_PING_RESPONSE = Object.freeze({
  gdprApplies: true,
  cmpLoaded: true,
  cmpStatus: "loaded",
  apiVersion: "2.2",
});

const DEFAULT_USP_PAYLOAD = Object.freeze({
  version: 1,
  uspString: "1YYY",
});

const DEFAULT_GPP_PAYLOAD = Object.freeze({
  gppVersion: "1.0",
  gppString: "",
  applicableSections: Object.freeze([]),
});

const noop = () => {};

/**
 * Provides a microtask scheduler compatible with older environments.
 * @returns {(callback: () => void) => void} - Scheduler that queues callbacks.
 */
function getTickScheduler() {
  if (typeof queueMicrotask === "function") {
    return queueMicrotask;
  }
  if (typeof Promise === "function" && typeof Promise.resolve === "function") {
    return (task) => {
      Promise.resolve().then(task).catch(noop);
    };
  }
  return (task) => {
    setTimeout(task, 0);
  };
}

/**
 * Safely invokes a callback with the provided payload.
 * @param {unknown} callback - Candidate callback to invoke.
 * @param {unknown} payload - Data to pass to the callback.
 * @param {boolean} success - Success flag passed to the callback.
 * @returns {void}
 */
function safeInvoke(callback, payload, success) {
  if (typeof callback !== "function") {
    return;
  }
  try {
    callback(payload, success);
  } catch {
    /* ignore */
  }
}

/**
 * Resolves the first callable argument among the provided candidates.
 * @param {unknown} primary - Primary callback candidate.
 * @param {unknown} secondary - Secondary callback candidate.
 * @returns {((...args: unknown[]) => unknown) | null} - Resolved callback.
 */
function resolveCallback(primary, secondary) {
  if (typeof primary === "function") {
    return primary;
  }
  if (typeof secondary === "function") {
    return secondary;
  }
  return null;
}

/**
 * Resolves the appropriate TCF response payload for a given command.
 * @param {string} command - TCF command identifier.
 * @returns {object} - Stub payload to return.
 */
function resolveTcfResponse(command) {
  return command === "ping" ? TCF_PING_RESPONSE : DEFAULT_TCF_PAYLOAD;
}

/**
 * Mimics CMP addEventListener behaviour by invoking the listener twice on separate ticks.
 * @param {unknown} callback - Listener callback to notify.
 * @param {(task: () => void) => void} schedule - Scheduler used for deferred callbacks.
 * @returns {number} - TCF mandated zero return value.
 */
function notifyTcfListener(callback, schedule) {
  safeInvoke(callback, DEFAULT_TCF_PAYLOAD, true);
  schedule(() => {
    safeInvoke(callback, DEFAULT_TCF_PAYLOAD, true);
  });
  return 0;
}

/**
 * Attempts to assign the provided cookie string while swallowing failures.
 * @param {string} cookieValue - Cookie string to write.
 * @returns {void}
 */
function trySetCookie(cookieValue) {
  if (typeof document === "undefined" || !document) {
    return;
  }
  try {
    Reflect.set(document, "cookie", cookieValue);
  } catch {
    /* ignore */
  }
}

/**
 * Pins a property on a target object by installing a getter that always returns a given value.
 * The original descriptor/value is restored when the returned cleanup callback is invoked.
 * @param {object} target - Object to augment.
 * @param {PropertyKey} property - Property name to override.
 * @param {unknown} value - Replacement value returned by the getter.
 * @returns {() => void} - Cleanup function.
 */
function pinProperty(target, property, value) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    return noop;
  }

  const safeProperty =
    typeof property === "string" || typeof property === "symbol" ? property : String(property);
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, safeProperty);
  const originalValue = originalDescriptor ? undefined : Reflect.get(target, safeProperty);

  const descriptor = {
    configurable: true,
    enumerable: false,
    get() {
      return value;
    },
    set() {
      // Keeping the stub in place prevents CMPs from replacing it.
    },
  };

  try {
    Object.defineProperty(target, safeProperty, descriptor);
  } catch {
    try {
      Reflect.set(target, safeProperty, value);
    } catch {
      /* ignore */
    }
  }

  return () => {
    try {
      const currentDescriptor = Object.getOwnPropertyDescriptor(target, safeProperty);
      if (currentDescriptor && currentDescriptor.get === descriptor.get) {
        if (originalDescriptor) {
          Object.defineProperty(target, safeProperty, originalDescriptor);
        } else {
          Reflect.deleteProperty(target, safeProperty);
          if (originalValue !== undefined) {
            Reflect.set(target, safeProperty, originalValue);
          }
        }
      }
    } catch {
      /* ignore */
    }
  };
}

/**
 * Builds a minimal stub for the IAB TCF v2 API that always signals "no consent".
 * @returns {(command: string, version: number, callback: (response: unknown, success: boolean) => void) => unknown} - TCF stub handler.
 */
function createTcfStub() {
  const schedule = getTickScheduler();

  return function tcfStub(command, _version, callback) {
    const normalizedCommand = typeof command === "string" ? command : "";
    if (normalizedCommand === "addEventListener") {
      return notifyTcfListener(callback, schedule);
    }

    const response = resolveTcfResponse(normalizedCommand);
    safeInvoke(callback, response, true);

    if (normalizedCommand === "removeEventListener") {
      return true;
    }
    return response;
  };
}

/**
 * Builds a stub for the CCPA/CPRA __uspapi that returns an opt-out string.
 * @returns {(command: string, versionOrCallback?: unknown, maybeCallback?: unknown) => unknown} - USP stub handler.
 */
function createUspStub() {
  return function uspStub(command, versionOrCallback, maybeCallback) {
    if (command !== "getUSPData") {
      return DEFAULT_USP_PAYLOAD;
    }

    const callback = resolveCallback(maybeCallback, versionOrCallback);
    safeInvoke(callback, DEFAULT_USP_PAYLOAD, true);

    return DEFAULT_USP_PAYLOAD;
  };
}

/**
 * Builds a stub for the IAB GPP API that returns empty consent data.
 * @returns {(command: string, versionOrCallback?: unknown, maybeCallback?: unknown) => unknown} - GPP stub handler.
 */
function createGppStub() {
  return function gppStub(command, versionOrCallback, maybeCallback) {
    const callback = resolveCallback(maybeCallback, versionOrCallback);

    if (command === "getGPPData") {
      safeInvoke(callback, DEFAULT_GPP_PAYLOAD, true);
      return DEFAULT_GPP_PAYLOAD;
    }

    if (command === "addEventListener") {
      return 0;
    }

    if (command === "removeEventListener") {
      return true;
    }

    return DEFAULT_GPP_PAYLOAD;
  };
}

/**
 * Ensures a hidden iframe with the TCF locator name exists so postMessage discovery succeeds.
 * @returns {{ frame: HTMLIFrameElement | null, owned: boolean }} - Locator frame details.
 */
function ensureLocatorFrame() {
  if (typeof document === "undefined" || !document || !document.documentElement) {
    return { frame: null, owned: false };
  }
  const existing = document.querySelector('iframe[name="__tcfapiLocator"]');
  if (existing instanceof HTMLIFrameElement) {
    return { frame: existing, owned: false };
  }
  let created = null;
  try {
    created = document.createElement("iframe");
    created.name = "__tcfapiLocator";
    created.style.setProperty("display", "none", "important");
    created.setAttribute("aria-hidden", "true");
    created.tabIndex = -1;
    document.documentElement.append(created);
  } catch {
    created = null;
  }
  return { frame: created, owned: Boolean(created) };
}

/**
 * Writes opt-out cookies understood by popular CMP integrations.
 * @returns {void}
 */
function dropConsentHints() {
  if (typeof document === "undefined" || !document) {
    return;
  }
  const cookieHints = [
    "IABTCF_TCString=;path=/;SameSite=Lax;Max-Age=0",
    "IABTCF_gdprApplies=1;path=/;SameSite=Lax",
    "usprivacy=;path=/;SameSite=Lax;Max-Age=0",
    "usprivacy=1YYY;path=/;SameSite=Lax",
  ];
  for (const cookieValue of cookieHints) {
    trySetCookie(cookieValue);
  }
}

/**
 * Sends a __tcfapiReturn payload back to the originating window when possible.
 * @param {Window | null} target - Message recipient.
 * @param {string | undefined} callId - Identifier associated with the original request.
 * @param {unknown} returnValue - Value returned by the stub.
 * @param {boolean} success - Indicates whether the operation succeeded.
 * @returns {void}
 */
function respondToTcfCall(target, callId, returnValue, success) {
  if (!target || typeof target.postMessage !== "function") {
    return;
  }
  try {
    target.postMessage(
      {
        __tcfapiReturn: {
          returnValue,
          success: Boolean(success),
          callId,
        },
      },
      "*",
    );
  } catch {
    /* ignore */
  }
}

/**
 * Installs a bridge so __tcfapi calls issued via window.postMessage are answered by the stub.
 * @param {(command: string, version: number, callback: (response: unknown, success: boolean) => void) => unknown} stub - TCF handler.
 * @returns {() => void} Cleanup callback that removes the listener.
 */
function installTcfPostMessageBridge(stub) {
  if (!stub || typeof stub !== "function") {
    return noop;
  }
  if (typeof globalThis === "undefined" || typeof globalThis.addEventListener !== "function") {
    return noop;
  }

  const handler = (event) => {
    const data = event && event.data;
    if (!data || !data.__tcfapiCall) {
      return;
    }
    const call = data.__tcfapiCall || {};
    const { command, version, callId } = call;
    let callbackTriggered = false;
    const target = event && event.source ? event.source : globalThis;

    const bridgeCallback = (payload, success) => {
      callbackTriggered = true;
      respondToTcfCall(target, callId, payload, success);
    };

    let returnValue = null;
    try {
      returnValue = stub(command, version, bridgeCallback);
    } catch {
      respondToTcfCall(target, callId, null, false);
      return;
    }

    if (!callbackTriggered) {
      respondToTcfCall(target, callId, returnValue, true);
    }
  };

  globalThis.addEventListener("message", handler, true);
  return () => {
    try {
      globalThis.removeEventListener("message", handler, true);
    } catch {
      /* ignore */
    }
  };
}

export const CMP_BLOCK_RULES = Object.freeze([
  { host: "consent.cookiebot.com", pathStartsWith: "/" },
  { host: "cdn.cookielaw.org", pathStartsWith: "/" },
  { host: "cmp.quantcast.com", pathStartsWith: "/" },
  { host: "cmp.dmdcdn.com", pathStartsWith: "/" },
  { host: "privacy.trustarc.com", pathStartsWith: "/" },
  { host: "sourcepoint.mgr.consensu.org", pathStartsWith: "/" },
  { host: "cmp.osano.com", pathStartsWith: "/" },
  { host: "policy.app.cmp.evidon.com", pathStartsWith: "/" },
  { host: "app.usercentrics.eu", pathStartsWith: "/" },
  { host: "cmp.usercentrics.eu", pathStartsWith: "/" },
  { host: "delivery.consentmanager.net", pathStartsWith: "/" },
  { host: "cdn.consentmanager.net", pathStartsWith: "/" },
]);

export class CmpNegator {
  enabled = false;
  _restorers = [];
  _locator = null;
  _ownsLocator = false;
  _tcfStub = Object.freeze(createTcfStub());
  _uspStub = Object.freeze(createUspStub());
  _gppStub = Object.freeze(createGppStub());

  enable() {
    if (this.enabled) {
      return;
    }
    this.enabled = true;
    const restorers = [
      pinProperty(globalThis, "__tcfapi", this._tcfStub),
      pinProperty(globalThis, "__uspapi", this._uspStub),
      pinProperty(globalThis, "__gpp", this._gppStub),
      installTcfPostMessageBridge(this._tcfStub),
    ];
    this._restorers.push(...restorers);

    const locator = ensureLocatorFrame();
    this._locator = locator.frame;
    this._ownsLocator = locator.owned;

    dropConsentHints();
  }

  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;
    while (this._restorers.length > 0) {
      const cleanup = this._restorers.pop();
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    }
    if (this._ownsLocator && this._locator) {
      try {
        this._locator.remove();
      } catch {
        /* ignore */
      }
    }
    this._locator = null;
    this._ownsLocator = false;
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * Rough heuristic to identify CMP script or asset URLs.
   * @param {string | null | undefined} href - Candidate URL.
   * @returns {boolean} True when the URL likely belongs to a CMP.
   */
  looksLikeCmpUrl(href) {
    if (!href) {
      return false;
    }
    return CMP_VENDOR_PATTERN.test(String(href));
  }
}

export const cmpNegator = new CmpNegator();

/**
 * Convenience helper to toggle the shared CMP negator instance.
 * @param {{ enabled: boolean }} settings - Feature configuration.
 * @returns {void}
 */
export function installCmpNegator(settings) {
  if (!settings || settings.enabled !== true) {
    cmpNegator.disable();
    return;
  }
  cmpNegator.enable();
}

/**
 * Exposes the heuristic used to detect CMP URLs without requiring access to the singleton.
 * @param {string | null | undefined} href - Candidate URL.
 * @returns {boolean} - True when the URL looks like a CMP resource.
 */
export function isCmpUrlCandidate(href) {
  return cmpNegator.looksLikeCmpUrl(href);
}
