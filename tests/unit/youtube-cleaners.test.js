import { describe, test, expect } from "@jest/globals";
import { URLCleaner } from "../../src/url/cleaner.js";

// Helper to parse params for assertions
const params = (urlStr) => {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    path: u.pathname,
    v: u.searchParams.get("v"),
    t: u.searchParams.get("t"),
    start: u.searchParams.get("start"),
    list: u.searchParams.get("list"),
    index: u.searchParams.get("index"),
    has: (name) => u.searchParams.has(name),
    raw: urlStr,
  };
};

// --- YouTube: /embed → /watch and /playlist ---
describe("YouTube cleaners - embed", () => {
  test("normalizes nocookie host and preserves t; strips iframe-only params", () => {
    const href = "https://www.youtube-nocookie.com/embed/VID123?t=15&autoplay=1&origin=x";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.host).toBe("www.youtube.com");
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("15");
    expect(p.has("autoplay")).toBe(false);
    expect(p.has("origin")).toBe(false);
  });

  test("preserves start when t is absent", () => {
    const href = "https://www.youtube.com/embed/VID123?start=7&controls=0";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe(null);
    expect(p.start).toBe("7");
    expect(p.has("controls")).toBe(false);
  });

  test("uses #t= from hash when present", () => {
    const href = "https://www.youtube.com/embed/VID123#t=2m03s";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("2m03s");
    expect(p.start).toBe(null);
  });

  test("videoseries → /playlist and keeps list", () => {
    const href = "https://www.youtube.com/embed/videoseries?list=PL123&autoplay=1";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/playlist");
    expect(p.list).toBe("PL123");
    expect(p.has("autoplay")).toBe(false);
    expect(p.v).toBe(null);
    expect(p.t).toBe(null);
    expect(p.start).toBe(null);
  });

  test("prefers t over start when both exist", () => {
    const href = "https://www.youtube.com/embed/VID123?t=90&start=12&rel=0";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("90");
    expect(p.start).toBe(null);
    expect(p.has("rel")).toBe(false);
  });
});

// --- YouTube: youtu.be → /watch ---
describe("YouTube cleaners - youtu.be", () => {
  test("preserves start when t is absent; strips share junk", () => {
    const href = "https://youtu.be/VID123?start=90&si=xyz";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.host).toBe("www.youtube.com");
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe(null);
    expect(p.start).toBe("90");
    expect(p.has("si")).toBe(false);
  });

  test("preserves list and index alongside t", () => {
    const href = "https://youtu.be/VID123?t=10&list=PL1&index=3";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("10");
    expect(p.list).toBe("PL1");
    expect(p.index).toBe("3");
  });

  test("accepts youtu.be/shorts/<id> form", () => {
    const href = "https://youtu.be/shorts/VID123?start=5";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe(null);
    expect(p.start).toBe("5");
  });

  test("prefers t over start when both exist", () => {
    const href = "https://youtu.be/VID123?t=77&start=11";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.t).toBe("77");
    expect(p.start).toBe(null);
  });
});

// --- YouTube: /shorts → /watch and canonical guarantees ---
describe("YouTube cleaners - shorts and canonicalization", () => {
  test("preserves t from query", () => {
    const href = "https://www.youtube.com/shorts/VID123?t=42";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.host).toBe("www.youtube.com");
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("42");
    expect(p.start).toBe(null);
  });

  test("preserves start when t is absent", () => {
    const href = "https://www.youtube.com/shorts/VID123?start=42";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe(null);
    expect(p.start).toBe("42");
  });

  test("preserves #t= in hash", () => {
    const href = "https://www.youtube.com/shorts/VID123#t=1m12s";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("1m12s");
    expect(p.start).toBe(null);
  });

  test("never emits both t and start on /watch", () => {
    const href = "https://www.youtube.com/shorts/VID123?t=10&start=5";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(Boolean(p.t) && Boolean(p.start)).toBe(false);
  });

  test("normalizes host and strips share params on /watch", () => {
    const href =
      "https://m.youtube.com/watch?v=VID123&t=42&si=abc&pp=def&feature=share&ab_channel=Foo";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.host).toBe("www.youtube.com");
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("VID123");
    expect(p.t).toBe("42");
    expect(p.has("si")).toBe(false);
    expect(p.has("pp")).toBe(false);
    expect(p.has("feature")).toBe(false);
    expect(p.has("ab_channel")).toBe(false);
  });

  test("strips start_radio on /watch", () => {
    const href = "https://www.youtube.com/watch?v=VID&list=PL&start_radio=1&pp=oAcB";
    const out = URLCleaner.cleanHref(href);
    const u = new URL(out);
    expect(u.searchParams.get("v")).toBe("VID");
    expect(u.searchParams.get("list")).toBe("PL");
    expect(u.searchParams.has("start_radio")).toBe(false);
    expect(u.searchParams.has("pp")).toBe(false);
  });

  test("preserves list and index when converting a short from www.youtube.com", () => {
    const href = "https://www.youtube.com/shorts/SHORT_ID?list=PLAYLIST_ID&index=5";
    const out = URLCleaner.cleanHref(href);
    const p = params(out);
    expect(p.host).toBe("www.youtube.com");
    expect(p.path).toBe("/watch");
    expect(p.v).toBe("SHORT_ID");
    expect(p.list).toBe("PLAYLIST_ID");
    expect(p.index).toBe("5");
  });
});
