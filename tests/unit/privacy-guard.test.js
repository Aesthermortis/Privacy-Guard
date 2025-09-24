import { jest } from "@jest/globals";
import { PrivacyGuard } from "../../src/core/privacy-guard.js";
import { EventLog } from "../../src/event-log.js";
import { CONFIG } from "../../src/config.js";
import { BLOCKED_RULES } from "../../src/blocklist.js";
import { URLCleaner } from "../../src/url/cleaner.js";

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
    BLOCKED_RULES.push({ host: location.hostname, pathStartsWith: "/ga-tracker" });
    try {
      const url = `${location.origin}/ga-tracker/collect.js`;
      expect(PrivacyGuard.shouldBlock(url)).toBe(true);
    } finally {
      BLOCKED_RULES.pop();
    }
  });

  test("allows same-origin tracker URLs when allowSameOrigin is enabled", () => {
    CONFIG.allowSameOrigin = true;
    BLOCKED_RULES.push({ host: location.hostname, pathStartsWith: "/ga-tracker" });
    try {
      const url = `${location.origin}/ga-tracker/collect.js`;
      expect(PrivacyGuard.shouldBlock(url)).toBe(false);
    } finally {
      BLOCKED_RULES.pop();
    }
  });

  test("ignores tracker hostnames that appear only in query parameters", () => {
    const url = "https://example.com/page?next=https://google-analytics.com/collect";
    expect(PrivacyGuard.shouldBlock(url)).toBe(false);
  });

  test("blocks tracker paths defined in structured rules", () => {
    const url = "https://www.facebook.com/plugins/like.php";
    expect(PrivacyGuard.shouldBlock(url)).toBe(true);
  });

  test("allows non-tracker paths on the same host", () => {
    const url = "https://www.facebook.com/profile";
    expect(PrivacyGuard.shouldBlock(url)).toBe(false);
  });
});

describe("URLCleaner.cleanHref", () => {
  test("keeps non-YouTube feature parameters", () => {
    const href = "https://example.com/watch?feature=player";
    expect(URLCleaner.cleanHref(href)).toBe("https://example.com/watch?feature=player");
  });

  test("strips YouTube share parameters", () => {
    const href =
      "https://www.youtube.com/watch?v=abc123&feature=share&ab_channel=TestChannel&si=foo&pp=some";
    expect(URLCleaner.cleanHref(href)).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("preserves timestamp when converting YouTube shorts URL", () => {
    const href = "https://www.youtube.com/shorts/shortId?t=10";
    const cleaned = URLCleaner.cleanHref(href);
    expect(cleaned).toBe("https://www.youtube.com/watch?v=shortId&t=10");
  });

  test("preserves timestamp in hash when converting YouTube shorts URL", () => {
    const href = "https://www.youtube.com/shorts/shortId#t=1m30s";
    const cleaned = URLCleaner.cleanHref(href);
    expect(cleaned).toBe("https://www.youtube.com/watch?v=shortId&t=1m30s");
  });

  test("preserves start parameter in YouTube watch URL", () => {
    const href = "https://www.youtube.com/watch?v=abc123&start=42&feature=share&si=xyz";
    const cleaned = URLCleaner.cleanHref(href);
    expect(cleaned).toBe("https://www.youtube.com/watch?v=abc123&start=42");
  });

  test("cleans youtu.be URL with timestamp and share params", () => {
    const href = "https://youtu.be/abc123?t=45&si=xyz";
    const cleaned = URLCleaner.cleanHref(href);
    expect(cleaned).toBe("https://www.youtube.com/watch?v=abc123&t=45");
  });

  describe("Amazon ref segment handling", () => {
    const cases = [
      {
        name: "removes /ref= segment anywhere in Amazon path",
        input: "https://www.amazon.com/dp/ABCDEF1234/ref=something/extra?utm_source=x",
        expected: "https://www.amazon.com/dp/ABCDEF1234",
      },
      {
        name: "removes ref_= tracking in Amazon search but keeps intent",
        input: "https://www.amazon.com/s?k=ssd&ref_=nb_sb_noss",
        expected: "https://www.amazon.com/s?k=ssd",
      },
      {
        name: "does not touch /ref= segment on non-Amazon domain (path only)",
        input: "https://example.com/blog/ref=campaign/page",
        expected: "https://example.com/blog/ref=campaign/page",
      },
      {
        name: "does not touch /ref= segment on non-Amazon domain (simple)",
        input: "https://example.com/a/ref=cstm",
        expected: "https://example.com/a/ref=cstm",
      },
    ];

    cases.forEach(({ name, input, expected }) => {
      test(name, () => {
        const cleaned = URLCleaner.cleanHref(input);
        expect(cleaned).toBe(expected);
      });
    });
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
