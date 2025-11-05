import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

describe("URLCleaningRuntime.maybeNeutralizeLinkEl", () => {
  let URLCleaningRuntime;
  let setShouldBlock;
  let URLCleaner;

  beforeEach(async () => {
    jest.resetModules();
    ({ URLCleaner } = await import("../../src/url/cleaner.js"));
    ({ URLCleaningRuntime, setShouldBlock } = await import("../../src/url/runtime.js"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const el of document.querySelectorAll("link")) {
      el.remove();
    }
  });

  test("should_remove_link_when_tracking_rel_without_href", () => {
    const link = document.createElement("link");
    link.setAttribute("rel", "prefetch");
    document.body.append(link);

    URLCleaningRuntime.maybeNeutralizeLinkEl(link);

    expect(link.isConnected).toBeFalse();
  });

  test("should_remove_link_when_block_predicate_matches", () => {
    const cleanSpy = jest.spyOn(URLCleaner, "cleanHref").mockReturnValue("https://cleaned.test/");
    setShouldBlock(() => true);

    const link = document.createElement("link");
    link.setAttribute("rel", "dns-prefetch");
    link.setAttribute("href", "https://tracking.test/collect");
    document.body.append(link);

    URLCleaningRuntime.maybeNeutralizeLinkEl(link);

    expect(link.isConnected).toBeFalse();
    expect(cleanSpy).not.toHaveBeenCalled();
  });

  test("should_clean_href_and_preserve_attributes_when_not_blocked", () => {
    const cleanSpy = jest.spyOn(URLCleaner, "cleanHref");
    cleanSpy.mockImplementation((href) => `https://clean.example/${encodeURIComponent(href)}`);

    const link = document.createElement("link");
    link.setAttribute("rel", "prefetch prerender");
    link.setAttribute("href", "https://cdn.example/file.js?foo=1");
    link.dataset.extra = "value";
    link.className = "alpha beta";
    document.body.append(link);

    URLCleaningRuntime.maybeNeutralizeLinkEl(link);

    expect(link.isConnected).toBeTrue();
    expect(link).toHaveAttribute(
      "href",
      "https://clean.example/" + encodeURIComponent("https://cdn.example/file.js?foo=1"),
    );
    expect(link.dataset.extra).toBe("value");
    expect(link.className).toBe("alpha beta");
    expect(link.dataset.privacyGuardCleaned).toBe("1");
    expect(cleanSpy).toHaveBeenCalledWith("https://cdn.example/file.js?foo=1", link.baseURI);
  });

  test("should_reset_block_predicate_when_non_function_passed", () => {
    const cleanSpy = jest
      .spyOn(URLCleaner, "cleanHref")
      .mockReturnValue("https://cleaned.example/");

    setShouldBlock(() => true);
    setShouldBlock(null);

    const link = document.createElement("link");
    link.setAttribute("rel", "preconnect");
    link.setAttribute("href", "https://example.com/");
    document.body.append(link);

    URLCleaningRuntime.maybeNeutralizeLinkEl(link);

    expect(link.isConnected).toBeTrue();
    expect(link).toHaveAttribute("href", "https://cleaned.example/");
    expect(link.dataset.privacyGuardCleaned).toBe("1");
    expect(cleanSpy).toHaveBeenCalledOnce();
  });
});

describe("URLCleaningRuntime.cleanSrcset", () => {
  let URLCleaningRuntime;
  let URLCleaner;

  beforeEach(async () => {
    jest.resetModules();
    ({ URLCleaner } = await import("../../src/url/cleaner.js"));
    ({ URLCleaningRuntime } = await import("../../src/url/runtime.js"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should_clean_each_entry_in_srcset", () => {
    const srcset = [
      "https://example.com/image-1x.jpg 1x",
      "https://example.com/image-2x.jpg 2x",
    ].join(", ");

    const cleanSpy = jest
      .spyOn(URLCleaner, "cleanHref")
      .mockImplementation((value) => `${value}?clean`);

    const result = URLCleaningRuntime.cleanSrcset(srcset);

    expect(result).toBe(
      "https://example.com/image-1x.jpg?clean 1x, https://example.com/image-2x.jpg?clean 2x",
    );
    expect(cleanSpy).toHaveBeenCalledTimes(2);
  });

  test("should_return_original_srcset_when_cleaning_throws", () => {
    const srcset = "https://example.com/image-1x.jpg 1x";
    jest.spyOn(URLCleaner, "cleanHref").mockImplementation(() => {
      throw new Error("boom");
    });

    const result = URLCleaningRuntime.cleanSrcset(srcset);

    expect(result).toBe(srcset);
  });

  test("should_return_non_string_inputs_unchanged", () => {
    expect(URLCleaningRuntime.cleanSrcset(null)).toBeNull();
    expect(URLCleaningRuntime.cleanSrcset(42)).toBe(42);
  });
});

describe("URLCleaningRuntime.rewriteElAttr", () => {
  let URLCleaningRuntime;
  let URLCleaner;

  beforeEach(async () => {
    jest.resetModules();
    ({ URLCleaner } = await import("../../src/url/cleaner.js"));
    ({ URLCleaningRuntime } = await import("../../src/url/runtime.js"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should_preserve_existing_data_attributes_and_classes", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "https://example.com/redirect?gclid=123");
    anchor.className = "cta-link";
    anchor.dataset.token = "abc";

    jest.spyOn(URLCleaner, "cleanHref").mockImplementation(() => "https://example.com/redirect");

    URLCleaningRuntime.rewriteElAttr(anchor, "href");

    expect(anchor).toHaveAttribute("href", "https://example.com/redirect");
    expect(anchor.className).toBe("cta-link");
    expect(anchor.dataset.token).toBe("abc");
    expect(anchor.dataset.privacyGuardCleaned).toBe("1");
  });

  test("should_mark_element_even_when_cleaner_returns_same_value", () => {
    const img = document.createElement("img");
    img.setAttribute("src", "https://example.com/image.jpg");

    jest.spyOn(URLCleaner, "cleanHref").mockImplementation((value) => value);

    URLCleaningRuntime.rewriteElAttr(img, "src");

    expect(img).toHaveAttribute("src", "https://example.com/image.jpg");
    expect(img.dataset.privacyGuardCleaned).toBe("1");
  });

  test("should_preserve_relative_href_when_cleaned_target_is_same_origin", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "/series/foo");

    jest.spyOn(URLCleaner, "cleanHref").mockImplementation(() => {
      return "https://example.test/series/foo?utm=1#section";
    });

    URLCleaningRuntime.rewriteElAttr(anchor, "href");

    expect(anchor).toHaveAttribute("href", "/series/foo?utm=1#section");
    expect(anchor.dataset.privacyGuardCleaned).toBe("1");
  });

  test("should_keep_absolute_href_when_cleaned_target_is_cross_origin", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "/movie/bar");

    jest.spyOn(URLCleaner, "cleanHref").mockImplementation(() => {
      return "https://cdn.example.com/movie/bar";
    });

    URLCleaningRuntime.rewriteElAttr(anchor, "href");

    expect(anchor).toHaveAttribute("href", "https://cdn.example.com/movie/bar");
    expect(anchor.dataset.privacyGuardCleaned).toBe("1");
  });
});
