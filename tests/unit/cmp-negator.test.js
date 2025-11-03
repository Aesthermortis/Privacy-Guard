import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  cmpNegator,
  installCmpNegator,
  isCmpUrlCandidate,
} from "../../src/features/cmp-negator.js";

const originalTcf = () => "legacy-tcf";
const originalUsp = () => "legacy-usp";

describe("cmp-negator module", () => {
  afterEach(() => {
    installCmpNegator({ enabled: false });
    delete globalThis.__tcfapi;
    delete globalThis.__uspapi;
    delete globalThis.__gpp;
  });

  it("locks down CMP APIs when enabled and restores them on disable", () => {
    globalThis.__tcfapi = originalTcf;
    globalThis.__uspapi = originalUsp;

    installCmpNegator({ enabled: true });

    expect(cmpNegator.isEnabled()).toBeTrue();
    expect(globalThis.__tcfapi).not.toBe(originalTcf);
    expect(globalThis.__uspapi).not.toBe(originalUsp);

    const tcfCallback = jest.fn();
    expect(() => globalThis.__tcfapi("getTCData", 2, tcfCallback)).not.toThrow();
    expect(tcfCallback).toHaveBeenCalledOnce();
    expect(tcfCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        cmpStatus: "loaded",
        eventStatus: "tcloaded",
      }),
      true,
    );

    const uspCallback = jest.fn();
    expect(() => globalThis.__uspapi("getUSPData", uspCallback)).not.toThrow();
    expect(uspCallback).toHaveBeenCalledOnce();
    expect(uspCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        uspString: "1YYY",
      }),
      true,
    );

    installCmpNegator({ enabled: false });

    expect(cmpNegator.isEnabled()).toBeFalse();
    expect(globalThis.__tcfapi).toBe(originalTcf);
    expect(globalThis.__uspapi).toBe(originalUsp);
  });

  it("detects CMP URLs via heuristics", () => {
    expect(isCmpUrlCandidate("https://cdn.cookielaw.org/loader.js")).toBeTrue();
    expect(isCmpUrlCandidate("https://consent.cookiebot.com/sdk.js")).toBeTrue();
    expect(isCmpUrlCandidate("https://app.usercentrics.eu/main.js")).toBeTrue();
    expect(isCmpUrlCandidate("https://static.example.com/app.js")).toBeFalse();
  });

  it("provides GPP stub responses", () => {
    installCmpNegator({ enabled: true });

    const callback = jest.fn();
    expect(() => globalThis.__gpp("getGPPData", callback)).not.toThrow();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        gppString: "",
        applicableSections: expect.any(Array),
      }),
      true,
    );

    expect(globalThis.__gpp("addEventListener")).toBe(0);
    expect(globalThis.__gpp("removeEventListener")).toBeTrue();
  });

  it("invokes TCF addEventListener callbacks twice", async () => {
    installCmpNegator({ enabled: true });

    const listener = jest.fn();
    const result = globalThis.__tcfapi("addEventListener", 2, listener);

    expect(result).toBe(0);
    expect(listener).toHaveBeenCalledOnce();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("responds to __tcfapi postMessage calls", async () => {
    installCmpNegator({ enabled: true });

    const callId = "bridge-test";
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", listener);
        reject(new Error("Timed out waiting for __tcfapiReturn"));
      }, 200);

      const listener = (event) => {
        const data = event && event.data;
        const payload = data && data.__tcfapiReturn;
        if (!payload || payload.callId !== callId) {
          return;
        }
        clearTimeout(timeout);
        window.removeEventListener("message", listener);
        resolve(payload);
      };

      window.addEventListener("message", listener);
      window.postMessage(
        {
          __tcfapiCall: {
            command: "ping",
            version: 2,
            callId,
          },
        },
        "*",
      );
    });

    expect(response.success).toBeTrue();
    expect(response.returnValue).toEqual(
      expect.objectContaining({
        cmpStatus: "loaded",
        cmpLoaded: true,
      }),
    );
  });
});
