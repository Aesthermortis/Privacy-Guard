import { jest } from "@jest/globals";
import { PrivacyGuard } from "./privacy-guard.js";
import { EventLog } from "../event-log.js";
import { CONFIG } from "../config.js";

describe("PrivacyGuard.shouldBlock", () => {
  let originalAllowSameOrigin;

  beforeEach(() => {
    originalAllowSameOrigin = CONFIG.allowSameOrigin;
    CONFIG.allowSameOrigin = false;
  });

  afterEach(() => {
    CONFIG.allowSameOrigin = originalAllowSameOrigin;
  });

  test("blocks URLs matching blocked patterns", () => {
    const shouldBlock = PrivacyGuard.shouldBlock("https://doubleclick.net/track.js");
    expect(shouldBlock).toBe(true);
  });

  test("allows safe schemes", () => {
    const shouldBlock = PrivacyGuard.shouldBlock("data:text/plain,hello");
    expect(shouldBlock).toBe(false);
  });

  test("blocks same-origin tracker URLs when allowSameOrigin is disabled", () => {
    const url = `${location.origin}/google-analytics.com/tracker.js`;
    expect(PrivacyGuard.shouldBlock(url)).toBe(true);
  });

  test("allows same-origin tracker URLs when allowSameOrigin is enabled", () => {
    CONFIG.allowSameOrigin = true;
    const url = `${location.origin}/google-analytics.com/tracker.js`;
    expect(PrivacyGuard.shouldBlock(url)).toBe(false);
  });
});

describe("PrivacyGuard.neutralizeScript", () => {
  let pushSpy;
  let consoleSpy;

  beforeEach(() => {
    pushSpy = jest.spyOn(EventLog, "push").mockImplementation(() => {});
    consoleSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    pushSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  test("neutralizes script elements and logs removal", () => {
    const script = document.createElement("script");
    script.src = "https://doubleclick.net/evil.js";
    script.setAttribute("nonce", "abc123");
    document.body.appendChild(script);

    const removeSpy = jest.spyOn(script, "remove");

    PrivacyGuard.neutralizeScript(script);

    expect(script.type).toBe("text/plain");
    expect(script.getAttribute("nonce")).toBeNull();
    expect(removeSpy).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "remove",
        reason: "script",
        url: "https://doubleclick.net/evil.js",
      }),
    );
    expect(script.isConnected).toBe(false);
  });
});
