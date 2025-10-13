export const FEATURES = {
  uiPanel: true,
  perDomainOverrides: true,
  extraRedirectors: true,
  rules: {
    youtube: true,
    ebay: true,
  },
};

export const MODE = {
  networkBlock: "fail", // "fail" | "silent"
};

export const CONFIG = {
  scriptBlockMode: "createElement", // "createElement" | "observer"
  allowSameOrigin: false, // block same-origin trackers unless explicitly allowed
};

/**
 * Apply per-domain overrides for a specific hostname.
 * @param {string} hostname - The hostname to apply overrides for.
 * @param {object} storage - The storage object containing overrides.
 * @returns {void}
 */
export function applyOverridesForHost(hostname, storage) {
  if (!FEATURES.perDomainOverrides || !storage) {
    return;
  }
  const overrides = storage.get(hostname);
  if (!overrides || overrides.enabled === false) {
    return;
  }
  if (overrides.networkBlock === "fail" || overrides.networkBlock === "silent") {
    MODE.networkBlock = overrides.networkBlock;
  }
  if (overrides.scriptBlockMode === "createElement" || overrides.scriptBlockMode === "observer") {
    CONFIG.scriptBlockMode = overrides.scriptBlockMode;
  }
  if (typeof overrides.allowSameOrigin === "boolean") {
    CONFIG.allowSameOrigin = overrides.allowSameOrigin;
  }
}
