import { jest } from "@jest/globals";
import { PrivacyGuard } from "../../src/core/privacy-guard.js";
import { EventLog } from "../../src/event-log.js";
import { CONFIG, MODE } from "../../src/config.js";
import { BLOCKED_HOSTS, BLOCKED_RULES } from "../../src/blocklist.js";
import { URLCleaner } from "../../src/url/cleaner.js";

const restoreBlockedRules = (snapshot) => {
  BLOCKED_RULES.length = 0;
  BLOCKED_RULES.push(...snapshot);
};

const captureBlockedHosts = () => [...BLOCKED_HOSTS];
const restoreBlockedHosts = (snapshot) => {
  BLOCKED_HOSTS.length = 0;
  BLOCKED_HOSTS.push(...snapshot);
};

const withAppendedBlockedHosts = (patterns, assertion) => {
  const snapshot = captureBlockedHosts();
  try {
    BLOCKED_HOSTS.push(...patterns);
    assertion();
  } finally {
    restoreBlockedHosts(snapshot);
  }
};

const withCustomBlockedHosts = (patterns, assertion) => {
  const snapshot = captureBlockedHosts();
  try {
    BLOCKED_HOSTS.length = 0;
    BLOCKED_HOSTS.push(...patterns);
    assertion();
  } finally {
    restoreBlockedHosts(snapshot);
  }
};

const captureBlockedRules = () => [...BLOCKED_RULES];
const withCustomBlockedRules = (rules, assertion) => {
  const snapshot = captureBlockedRules();
  try {
    BLOCKED_RULES.length = 0;
    BLOCKED_RULES.push(...rules);
    assertion();
  } finally {
    restoreBlockedRules(snapshot);
  }
};

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
    expect(shouldBlock).toBeTrue();
  });

  test("allows safe schemes", () => {
    const shouldBlock = PrivacyGuard.shouldBlock("data:text/plain,hello");
    expect(shouldBlock).toBeFalse();
  });

  test("blocks same-origin tracker URLs when allowSameOrigin is disabled", () => {
    BLOCKED_RULES.push({ host: location.hostname, pathStartsWith: "/ga-tracker" });
    try {
      const url = `${location.origin}/ga-tracker/collect.js`;
      expect(PrivacyGuard.shouldBlock(url)).toBeTrue();
    } finally {
      BLOCKED_RULES.pop();
    }
  });

  test("allows same-origin tracker URLs when allowSameOrigin is enabled", () => {
    CONFIG.allowSameOrigin = true;
    BLOCKED_RULES.push({ host: location.hostname, pathStartsWith: "/ga-tracker" });
    try {
      const url = `${location.origin}/ga-tracker/collect.js`;
      expect(PrivacyGuard.shouldBlock(url)).toBeFalse();
    } finally {
      BLOCKED_RULES.pop();
    }
  });

  test("ignores tracker hostnames that appear only in query parameters", () => {
    const url = "https://example.com/page?next=https://google-analytics.com/collect";
    expect(PrivacyGuard.shouldBlock(url)).toBeFalse();
  });

  test("blocks tracker paths defined in structured rules", () => {
    const url = "https://www.facebook.com/plugins/like.php";
    expect(PrivacyGuard.shouldBlock(url)).toBeTrue();
  });

  test("allows non-tracker paths on the same host", () => {
    const url = "https://www.facebook.com/profile";
    expect(PrivacyGuard.shouldBlock(url)).toBeFalse();
  });
});

describe("PrivacyGuard hostname matching", () => {
  test("prevents suffix-based false positives", () => {
    withAppendedBlockedHosts(["ample.com"], () => {
      expect(PrivacyGuard.shouldBlock("https://example.com/page")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://testample.com/page")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://ample.com/track")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.ample.com/track")).toBeTrue();
    });
  });
  test("handles short domain patterns without false positives", () => {
    withAppendedBlockedHosts(["x.co"], () => {
      expect(PrivacyGuard.shouldBlock("https://ex.co/page")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://tax.co/page")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://x.co/track")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.x.co/track")).toBeTrue();
    });
  });
  test("treats wildcard patterns as matching apex and subdomains", () => {
    withAppendedBlockedHosts(["*.example.com"], () => {
      // Wildcard semantics remain permissive: the apex and any subdomain are blocked.
      expect(PrivacyGuard.shouldBlock("https://example.com/page")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/page")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://a.b.example.com/page")).toBeTrue();
      // Strict semantics would require excluding the apex by checking host !== base; documented here to avoid unintended changes.
    });
  });
  test("normalizes case differences and trailing dots before matching", () => {
    withAppendedBlockedHosts(["Example.COM."], () => {
      expect(PrivacyGuard.shouldBlock("https://example.com./tracker")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://EXAMPLE.COM./tracker")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://Sub.Example.CoM./tracker")).toBeTrue();
    });
  });
  test("does not treat IP addresses as hostname matches", () => {
    withAppendedBlockedHosts(["example.com"], () => {
      expect(PrivacyGuard.shouldBlock("https://93.184.216.34/resource")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://[2001:db8::1]/resource")).toBeFalse();
    });
  });
  test("ignores scheme and port differences when host matches", () => {
    withAppendedBlockedHosts(["example.com"], () => {
      expect(PrivacyGuard.shouldBlock("http://example.com:80/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://example.com:443/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com:8443/a")).toBeTrue();
    });
  });
  test("avoids blocking lookalike substrings", () => {
    withAppendedBlockedHosts(["example.com"], () => {
      expect(PrivacyGuard.shouldBlock("https://testexample.com/a")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://ex-ample.com/a")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/a")).toBeTrue();
    });
  });
  test("matches multi-label patterns without relying on a PSL", () => {
    withAppendedBlockedHosts(["co.uk"], () => {
      expect(PrivacyGuard.shouldBlock("https://example.co.uk/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.example.co.uk/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://example.uk/a")).toBeFalse();
    });
  });
  test("ignores invalid or trivial patterns while handling duplicates", () => {
    withCustomBlockedHosts(["", "   ", "*", "*.", ".", null, void 0], () => {
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeFalse();
    });
    withCustomBlockedHosts(["example.com", "example.com"], () => {
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeTrue();
    });
  });
  test("trims whitespace around patterns", () => {
    withAppendedBlockedHosts(["   example.com   "], () => {
      // Hosts originate from URL.hostname and therefore never include whitespace; trimming keeps parity with stored patterns.
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeTrue();
    });
  });
  test("fails safe when URL lacks a hostname", () => {
    expect(PrivacyGuard.shouldBlock(null)).toBeFalse();
    expect(PrivacyGuard.shouldBlock()).toBeFalse();
    expect(PrivacyGuard.shouldBlock("mailto:user@example.com")).toBeFalse();
    expect(PrivacyGuard.shouldBlock("not a valid url")).toBeFalse();
  });
  test("normalizes wildcard patterns with trailing dots and case differences", () => {
    withAppendedBlockedHosts(["*.Example.COM."], () => {
      // Normalization lowers case and removes trailing dots before comparing trailing labels.
      // Wildcard semantics stay permissive: apex and subdomains are intentionally blocked together.
      expect(PrivacyGuard.shouldBlock("https://example.com./analytics")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://Sub.Example.com./pixel")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://deep.sub.EXAMPLE.COM./collect")).toBeTrue();
    });
  });
  test("ignores creatively invalid wildcard patterns", () => {
    withCustomBlockedHosts(["*.*.example.com", "**.example.com", "*..example.com"], () => {
      // Only single-segment wildcards (e.g. '*.example.com') are supported; other shapes are treated as inert noise.
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/a")).toBeFalse();
    });
  });
  test("treats leading-dot patterns as invalid", () => {
    withAppendedBlockedHosts([".example.com"], () => {
      // A leading dot has no semantic meaning in label-aware comparisons, so it should not affect apex or subdomains.
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/a")).toBeFalse();
    });
  });
  test("ignores patterns formed by stray dots", () => {
    withCustomBlockedHosts(["..", ". .", " . "], () => {
      // Whitespace or lone-dot patterns are sanitized away and never trigger a match.
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeFalse();
    });
  });
  test("applies only valid entries when mixed with invalid noise", () => {
    withCustomBlockedHosts(["example.com", "*.*.example.com", ".example.com", ".."], () => {
      // Noise entries are ignored, leaving the valid host as the sole contributor to blocking decisions.
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/a")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://example.com.tracker/a")).toBeFalse();
    });
  });
  test("matches hosts with deep label chains", () => {
    withAppendedBlockedHosts(["example.com"], () => {
      // Matching compares the suffix labels, so arbitrary subdomain depth still resolves correctly.
      expect(PrivacyGuard.shouldBlock("https://a.b.c.d.e.example.com/collect")).toBeTrue();
    });
  });
  test("matches patterns containing hyphens and digits literally", () => {
    withAppendedBlockedHosts(["a-1-example.com"], () => {
      // Label comparison is literal: hyphens and digits must line up exactly across each segment.
      expect(PrivacyGuard.shouldBlock("https://a-1-example.com/track")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.a-1-example.com/track")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://a1example.com/track")).toBeFalse();
    });
  });
  test("keeps overlapping prefixes independent across patterns", () => {
    withCustomBlockedHosts(["ample.com", "example.com"], () => {
      // Each pattern is evaluated independently, preventing suffix fixes from regressing when similar hosts coexist.
      expect(PrivacyGuard.shouldBlock("https://ample.com/pixel")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.ample.com/pixel")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://example.com/pixel")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/pixel")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://testample.com/pixel")).toBeFalse();
    });
  });
  test("does not treat top-level domains as catch-alls", () => {
    withAppendedBlockedHosts(["com"], () => {
      // Without PSL data the matcher compares explicit labels only; bare TLDs should never blanket-match multi-label hosts.
      expect(PrivacyGuard.shouldBlock("https://example.com/a")).toBeFalse();
      expect(PrivacyGuard.shouldBlock("https://sub.example.com/a")).toBeFalse();
    });
  });
  test("documents composition between BLOCKED_RULES and BLOCKED_HOSTS", () => {
    const pathRule = { host: "example.com", pathStartsWith: "/pixel" };
    withCustomBlockedHosts([], () => {
      withCustomBlockedRules([pathRule], () => {
        // Case A: path rules operate even without host entries, targeting only the configured prefix.
        expect(PrivacyGuard.shouldBlock("https://example.com/pixel/collect")).toBeTrue();
        expect(PrivacyGuard.shouldBlock("https://example.com/other")).toBeFalse();
      });
    });
    withCustomBlockedHosts(["example.com"], () => {
      withCustomBlockedRules([], () => {
        // Case B: host entries alone block every path regardless of scheme or port.
        expect(PrivacyGuard.shouldBlock("https://example.com/pixel/collect")).toBeTrue();
        expect(PrivacyGuard.shouldBlock("https://example.com/other")).toBeTrue();
      });
    });
  });
  test("restores blocklist state after intensive mutations", () => {
    const baseline = captureBlockedHosts();
    withAppendedBlockedHosts(["example.com", "*.example.net"], () => {
      // Stress the snapshot/restore helpers by mutating order and length within the scoped block.
      BLOCKED_HOSTS.push("extra.invalid");
      BLOCKED_HOSTS.sort();
      expect(PrivacyGuard.shouldBlock("https://example.com/pixel")).toBeTrue();
      expect(PrivacyGuard.shouldBlock("https://api.example.net/pixel")).toBeTrue();
    });
    expect(BLOCKED_HOSTS).toEqual(baseline);
  });
  test("skips host-based evaluation for special scheme URLs", () => {
    // When no hostname is present, host-based blocking is skipped; other layers decide handling.
    expect(PrivacyGuard.shouldBlock("about:blank")).toBeFalse();
    expect(PrivacyGuard.shouldBlock("blob:https://example.com/id")).toBeFalse();
    expect(PrivacyGuard.shouldBlock("filesystem:https://example.com/temporary/file")).toBeFalse();
  });
  const realHosts = [
    {
      pattern: "doubleclick.net",
      subdomain: "ads.doubleclick.net",
      lookalike: "doubleclick.net.example",
    },
    {
      pattern: "googletagmanager.com",
      subdomain: "cdn.googletagmanager.com",
      lookalike: "googletagmanager.com.evil",
    },
    {
      pattern: "collector.github.com",
      subdomain: "cdn.collector.github.com",
      lookalike: "collector.github.com.tracker",
    },
  ];
  test.each(realHosts)(
    "blocks real blocklist host %s and its subdomains without false positives",
    ({ pattern, subdomain, lookalike }) => {
      expect(PrivacyGuard.shouldBlock(`https://${pattern}/track`)).toBeTrue();
      expect(PrivacyGuard.shouldBlock(`https://${subdomain}/track`)).toBeTrue();
      expect(PrivacyGuard.shouldBlock(`https://${lookalike}/track`)).toBeFalse();
    },
  );
  // Notes for future maintainers:
  // - Trailing dots are normalized on both hostnames and patterns.
  // - Matching is case-insensitive and based solely on label comparisons (no PSL awareness).
  // - Wildcard patterns (*.example.com) intentionally match the apex domain to preserve historical behavior.
  // - Invalid or noisy patterns are ignored, even when mixed with valid entries.
  // - IP addresses are out of scope for hostname patterns and do not match domain rules.
  // - Snapshot helpers restore BLOCKED_HOSTS/BLOCKED_RULES so tests never leak global state.
  // - Scheme-only URLs (about:, blob:, filesystem:) stay outside host-based blocking.
  // - If internationalized domains are ever supported, convert both sides to ASCII (punycode) before comparing.
  // - No additional dependencies or runner changes were introduced; robustness against suffix lookalikes is verified via shouldBlock().
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

    for (const { name, input, expected } of cases) {
      test(`${name}`, () => {
        const cleaned = URLCleaner.cleanHref(input);
        expect(cleaned).toBe(expected);
      });
    }
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
    document.body.append(script);

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
    expect(script.isConnected).toBeFalse();
  });
});

describe("PrivacyGuard.interceptElementCreation", () => {
  let originalCreateElement;
  let originalInitialized;
  let originalScriptBlockMode;

  beforeEach(() => {
    originalCreateElement = document.createElement;
    originalInitialized = PrivacyGuard._initialized;
    originalScriptBlockMode = CONFIG.scriptBlockMode;
    PrivacyGuard._initialized = false; // Allow re-initialization
    jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(false);
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    PrivacyGuard._initialized = originalInitialized;
    CONFIG.scriptBlockMode = originalScriptBlockMode;
    jest.restoreAllMocks();
  });

  test("prevents setting src attribute on a blocked script", () => {
    CONFIG.scriptBlockMode = "createElement";
    PrivacyGuard.init(); // This will call interceptElementCreation

    PrivacyGuard.shouldBlock.mockImplementation((url) => {
      try {
        return new URL(url).hostname === "evil-tracker.com";
      } catch {
        return false;
      }
    });

    const script = document.createElement("script");
    const setAttributeSpy = jest.spyOn(script, "setAttribute");

    script.src = "https://evil-tracker.com/track.js";

    expect(setAttributeSpy).toHaveBeenCalledWith("type", "text/plain");
    expect(setAttributeSpy).not.toHaveBeenCalledWith("src", "https://evil-tracker.com/track.js");
  });
});

describe("PrivacyGuard.interceptFetch", () => {
  let environmentFetch;
  let environmentResponse;
  let responseShimCreated = false;
  let mockOriginalFetch;
  let shouldBlockSpy;
  let eventLogSpy;
  let originalNetworkMode;

  beforeAll(() => {
    environmentFetch = globalThis.fetch;
    environmentResponse = globalThis.Response;
    if (typeof environmentResponse !== "function") {
      responseShimCreated = true;
      globalThis.Response = class ResponseShim {
        constructor(body, init = {}) {
          this.body = body;
          this.status = init.status ?? 200;
          this.statusText = init.statusText ?? "";
        }
      };
    }
  });

  afterAll(() => {
    globalThis.fetch = environmentFetch;
    if (responseShimCreated) {
      delete globalThis.Response;
    } else {
      globalThis.Response = environmentResponse;
    }
  });

  beforeEach(() => {
    originalNetworkMode = MODE.networkBlock;
    mockOriginalFetch = jest
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200, statusText: "OK" }));
    globalThis.fetch = mockOriginalFetch;
    shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock");
    eventLogSpy = jest.spyOn(EventLog, "push").mockImplementation(() => {});
  });

  afterEach(() => {
    if (shouldBlockSpy) {
      shouldBlockSpy.mockRestore();
      shouldBlockSpy = undefined;
    }
    if (eventLogSpy) {
      eventLogSpy.mockRestore();
      eventLogSpy = undefined;
    }
    globalThis.fetch = environmentFetch;
    MODE.networkBlock = originalNetworkMode;
  });

  test("should reject fetch when tracker detected in fail mode", async () => {
    MODE.networkBlock = "fail";
    shouldBlockSpy.mockReturnValue(true);

    PrivacyGuard.interceptFetch();

    // Use Jest's promise rejection matcher to avoid conditional expects
    await expect(globalThis.fetch("https://tracker.example/collect")).rejects.toThrow(
      "PrivacyGuard blocked: https://tracker.example/collect",
    );

    expect(mockOriginalFetch).not.toHaveBeenCalled();
    expect(eventLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "fetch",
        reason: "fail",
        url: "https://tracker.example/collect",
      }),
    );
  });

  test("should return no content response when tracker detected in silent mode", async () => {
    MODE.networkBlock = "silent";
    const requestLike = { url: new URL("https://tracker.example/script.js") };
    shouldBlockSpy.mockReturnValueOnce(true);

    PrivacyGuard.interceptFetch();

    const response = await globalThis.fetch(requestLike);

    expect(shouldBlockSpy).toHaveBeenCalledWith("https://tracker.example/script.js");
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(204);
    expect(eventLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "fetch",
        reason: "silent",
        url: "https://tracker.example/script.js",
      }),
    );
    expect(mockOriginalFetch).not.toHaveBeenCalled();
  });

  test("should forward to original fetch when url is allowed", async () => {
    MODE.networkBlock = "fail";
    shouldBlockSpy.mockReturnValueOnce(false);

    PrivacyGuard.interceptFetch();

    const context = { custom: "context" };
    const args = ["https://example.com/api", { method: "POST" }];
    const result = await globalThis.fetch.call(context, ...args);

    expect(result).toEqual(expect.objectContaining({ status: 200, statusText: "OK" }));
    expect(mockOriginalFetch).toHaveBeenCalledWith(...args);
    expect(mockOriginalFetch.mock.contexts[0]).toBe(context);
    expect(eventLogSpy).not.toHaveBeenCalled();
  });
});
