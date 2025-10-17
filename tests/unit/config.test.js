import { jest } from "@jest/globals";
import { applyOverridesForHost, CONFIG, FEATURES, MODE } from "../../src/config.js";

describe("applyOverridesForHost", () => {
  const HOSTNAME = "example.com";
  let originalPerDomainOverrides;
  let modeSnapshot;
  let configSnapshot;
  beforeEach(() => {
    originalPerDomainOverrides = FEATURES.perDomainOverrides;
    modeSnapshot = { ...MODE };
    configSnapshot = { ...CONFIG };
    FEATURES.perDomainOverrides = true;
    MODE.networkBlock = modeSnapshot.networkBlock;
    CONFIG.scriptBlockMode = configSnapshot.scriptBlockMode;
    CONFIG.allowSameOrigin = configSnapshot.allowSameOrigin;
  });
  afterEach(() => {
    FEATURES.perDomainOverrides = originalPerDomainOverrides;
    MODE.networkBlock = modeSnapshot.networkBlock;
    CONFIG.scriptBlockMode = configSnapshot.scriptBlockMode;
    CONFIG.allowSameOrigin = configSnapshot.allowSameOrigin;
  });
  it("should_skip_storage_lookup_when_per_domain_overrides_are_disabled", () => {
    FEATURES.perDomainOverrides = false;
    const storage = { get: jest.fn() };
    applyOverridesForHost(HOSTNAME, storage);
    expect(storage.get).not.toHaveBeenCalled();
    expect(MODE.networkBlock).toBe(modeSnapshot.networkBlock);
    expect(CONFIG.scriptBlockMode).toBe(configSnapshot.scriptBlockMode);
    expect(CONFIG.allowSameOrigin).toBe(configSnapshot.allowSameOrigin);
  });
  it("should_use_stored_overrides_when_enabled", () => {
    const storage = {
      get: jest.fn().mockReturnValue({
        enabled: true,
        networkBlock: "silent",
        scriptBlockMode: "observer",
        allowSameOrigin: true,
      }),
    };
    applyOverridesForHost(HOSTNAME, storage);
    expect(storage.get).toHaveBeenCalledWith(HOSTNAME);
    expect(MODE.networkBlock).toBe("silent");
    expect(CONFIG.scriptBlockMode).toBe("observer");
    expect(CONFIG.allowSameOrigin).toBeTrue();
  });
  it("should_ignore_storage_when_no_overrides_are_returned", () => {
    const storage = { get: jest.fn().mockReturnValue(null) };
    applyOverridesForHost(HOSTNAME, storage);
    expect(storage.get).toHaveBeenCalledWith(HOSTNAME);
    expect(MODE.networkBlock).toBe(modeSnapshot.networkBlock);
    expect(CONFIG.scriptBlockMode).toBe(configSnapshot.scriptBlockMode);
    expect(CONFIG.allowSameOrigin).toBe(configSnapshot.allowSameOrigin);
  });
  it("should_ignore_disabled_overrides_payload", () => {
    const storage = {
      get: jest.fn().mockReturnValue({
        enabled: false,
        networkBlock: "silent",
        scriptBlockMode: "observer",
        allowSameOrigin: true,
      }),
    };
    applyOverridesForHost(HOSTNAME, storage);
    expect(MODE.networkBlock).toBe(modeSnapshot.networkBlock);
    expect(CONFIG.scriptBlockMode).toBe(configSnapshot.scriptBlockMode);
    expect(CONFIG.allowSameOrigin).toBe(configSnapshot.allowSameOrigin);
  });
  it("should_reject_invalid_override_values", () => {
    const storage = {
      get: jest.fn().mockReturnValue({
        enabled: true,
        networkBlock: "invalid",
        scriptBlockMode: "other",
        allowSameOrigin: "yes",
      }),
    };
    applyOverridesForHost(HOSTNAME, storage);
    expect(MODE.networkBlock).toBe(modeSnapshot.networkBlock);
    expect(CONFIG.scriptBlockMode).toBe(configSnapshot.scriptBlockMode);
    expect(CONFIG.allowSameOrigin).toBe(configSnapshot.allowSameOrigin);
  });
});
