import { FEATURES } from "../config.js";

const JAVASCRIPT_PROTOCOL = "javascript" + ":";

export const URLCleaner = {
  // Global param blacklist (lowercased compare)
  GLOBAL_STRIP: new Set([
    // Common marketing
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "utm_name",
    "utm_reader",
    "utm_brand",
    "utm_social",
    "utm_viz_id",
    // Ad/attribution
    "gclid",
    "dclid",
    "msclkid",
    "fbclid",
    "twclid",
    "igshid",
    "vero_id",
    "mc_eid",
    "spm",
    "sc_cid",
    "s_cid",
    "pk_campaign",
    "pk_kwd",
    // Misc
    "referrer",
    "ref_src",
    "ref_url",
    "source",
    "cmp",
    "campaign",
    "adid",
    "ad",
    "cid",
    // Extra noise seen in the wild
    "_hsenc",
    "_hsmi",
    "oly_anon_id",
    "oly_enc_id",
    "mkt_tok",
    "algo_pvid",
    "algo_exp_id",
  ]),

  // Redirector patterns: extract ?u= or ?url= etc.
  REDIRECTORS: [
    { hostIncludes: "l.facebook.com", param: ["u", "url"] },
    { hostIncludes: "lm.facebook.com", param: ["u", "url"] },
    { hostIncludes: "out.reddit.com", param: ["url"] },
    { hostIncludes: "t.co", param: ["url"] },
    { hostIncludes: "google.com", pathHas: "/url", param: ["q", "url", "u"] },
    { hostIncludes: "news.google", pathHas: "/articles", param: ["url"] },
    // Extra redirectors if enabled
    ...(FEATURES.extraRedirectors
      ? [
          { hostIncludes: "youtube.com", pathHas: "/redirect", param: ["q", "url", "u"] },
          { hostIncludes: "youtu.be", param: ["q", "url"] },
          { hostIncludes: "l.instagram.com", param: ["u", "url"] },
          { hostIncludes: "lnkd.in", param: ["url"] },
          { hostIncludes: "linkedin.com", pathHas: "/redir/redirect", param: ["url"] },
          { hostIncludes: "bing.com", pathHas: "/ck/a", param: ["u", "url"] },
          { hostIncludes: "r20.rs6.net", param: ["url"] },
          { hostIncludes: "safelinks.protection.outlook.com", param: ["url"] },
        ]
      : []),
  ],

  isYouTubeRedirectPath(u) {
    return u.pathname === "/redirect";
  },

  extractYouTubeTimeFromHash(hash) {
    if (!hash) {
      return "";
    }
    const match = hash.match(/(?:^|[#&])t=([^&]+)/);
    return match ? match[1] : "";
  },

  collectYouTubePlaybackContext(u) {
    return {
      canonicalTime: u.searchParams.get("t") || this.extractYouTubeTimeFromHash(u.hash),
      startParam: u.searchParams.get("start"),
      playlistId: u.searchParams.get("list"),
      playlistIndex: u.searchParams.get("index"),
    };
  },

  applyYouTubePlaybackParams(u, context = {}) {
    const { canonicalTime, startParam, playlistId, playlistIndex } = context;
    if (playlistId) {
      u.searchParams.set("list", playlistId);
    }
    if (playlistIndex) {
      u.searchParams.set("index", playlistIndex);
    }
    if (canonicalTime) {
      u.searchParams.set("t", canonicalTime);
    } else if (startParam) {
      u.searchParams.set("start", startParam);
    }
  },

  transformToYouTubeWatch(u, videoId, context = {}) {
    if (!videoId) {
      return;
    }

    u.hostname = "www.youtube.com";
    u.pathname = "/watch";
    u.search = "";
    u.searchParams.set("v", videoId);
    this.applyYouTubePlaybackParams(u, context);
    u.hash = "";
  },

  normalizeYouTubeSpecialPaths(u) {
    if (u.pathname === "/watch") {
      return false;
    }

    const embedOrShortsMatch = u.pathname.match(/^\/(shorts|embed)\/([^/?#]+)/);
    if (!embedOrShortsMatch) {
      return false;
    }

    const [, section, resourceId] = embedOrShortsMatch;
    const isEmbed = section === "embed";

    if (isEmbed) {
      u.hostname = "www.youtube.com";
    }

    if (isEmbed && resourceId === "videoseries") {
      const playlistId = u.searchParams.get("list");
      if (playlistId) {
        u.pathname = "/playlist";
        u.search = "";
        u.searchParams.set("list", playlistId);
        u.hash = "";
      }
      return true;
    }

    if (!resourceId) {
      return false;
    }

    const context = this.collectYouTubePlaybackContext(u);
    this.transformToYouTubeWatch(u, resourceId, context);
    return true;
  },

  extractShortVideoId(u) {
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return "";
    }
    if (segments[0] === "shorts" && segments[1]) {
      return segments[1];
    }
    return segments[0];
  },

  isLikelyYouTubeId(id) {
    return typeof id === "string" && id.length > 5;
  },

  sanitizeYouTubeWatch(u) {
    const allowedParams = new Set(["v", "t", "start", "list", "index"]);
    this.stripParams(u, allowedParams, false);

    const shareParams = ["si", "pp", "feature", "ab_channel", "start_radio"];
    for (const paramName of shareParams) {
      u.searchParams.delete(paramName);
    }

    u.hostname = "www.youtube.com";
  },

  isParamAllowed(key, keyLC, allowlist, preserveCase) {
    const list = allowlist ?? new Set();
    return preserveCase ? list.has(key) : list.has(keyLC);
  },

  isAmazonNoiseKey(keyLC, value) {
    if (value === "") {
      return true;
    }

    return (
      keyLC === "ref" ||
      keyLC === "ref_src" ||
      keyLC === "ref_url" ||
      keyLC.startsWith("ref_") ||
      keyLC === "_encoding" ||
      keyLC.startsWith("pf_rd_") ||
      keyLC.startsWith("pd_rd_") ||
      keyLC === "content-id"
    );
  },

  shouldStripParam(key, value, allowlist, preserveCase) {
    const keyLC = key.toLowerCase();
    if (this.isParamAllowed(key, keyLC, allowlist, preserveCase)) {
      return false;
    }

    if (this.GLOBAL_STRIP.has(keyLC) || keyLC.startsWith("utm_")) {
      return true;
    }

    return this.isAmazonNoiseKey(keyLC, value);
  },

  matchesRedirectRule(rule, host, path) {
    return host.includes(rule.hostIncludes) && (!rule.pathHas || path.includes(rule.pathHas));
  },

  parseRedirectTarget(value) {
    if (!value) {
      return null;
    }
    try {
      return new URL(value);
    } catch {
      try {
        return new URL(decodeURIComponent(value));
      } catch {
        return null;
      }
    }
  },

  extractRedirectTarget(u, rule) {
    for (const name of rule.param) {
      const candidate = this.parseRedirectTarget(u.searchParams.get(name));
      if (candidate) {
        return candidate;
      }
    }
    return null;
  },

  // Domain-specific rules (lower priority than redirect resolution)
  byDomain(u) {
    const host = u.hostname.toLowerCase();

    if (this.isAppsFlyerHost(host)) {
      this.cleanAppsflyer(u);
      return;
    }

    // AMAZON: canonicalize to /dp/ASIN and strip noisy params.
    if (
      host.endsWith(".amazon.com") ||
      host.endsWith(".amazon.co.uk") ||
      host.endsWith(".amazon.de") ||
      host.endsWith(".amazon.fr") ||
      host.endsWith(".amazon.es") ||
      host.endsWith(".amazon.it") ||
      host.endsWith(".amazon.ca") ||
      host.endsWith(".amazon.com.mx") ||
      host.endsWith(".amazon.co.jp") ||
      host === "amazon.com"
    ) {
      this.cleanAmazon(u);
      return;
    }

    // YOUTUBE: strip noisy params, keep essential ones
    if (
      FEATURES.rules.youtube &&
      (host === "www.youtube.com" ||
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "youtube-nocookie.com" ||
        host === "www.youtube-nocookie.com")
    ) {
      this.cleanYouTube(u);
      return;
    }
    if (FEATURES.rules.youtube && host === "youtu.be") {
      this.cleanYouTubeShort(u);
      return;
    }

    // eBay: strip noisy params, keep essential ones
    if (
      FEATURES.rules.ebay &&
      (host.endsWith(".ebay.com") ||
        host.endsWith(".ebay.co.uk") ||
        host.endsWith(".ebay.de") ||
        host.endsWith(".ebay.fr") ||
        host.endsWith(".ebay.it") ||
        host.endsWith(".ebay.es"))
    ) {
      this.cleanEbay(u);
    }
  },

  isAppsFlyerHost(host) {
    if (!host) {
      return false;
    }
    return (
      host === "appsflyer.com" ||
      host.endsWith(".appsflyer.com") ||
      host === "onelink.me" ||
      host.endsWith(".onelink.me")
    );
  },

  cleanAppsflyer(u) {
    const toDelete = [];
    for (const key of u.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (
        lower === "pid" ||
        lower === "c" ||
        lower === "deep_link_value" ||
        lower.startsWith("af_") ||
        /^af_sub[1-5]$/i.test(lower)
      ) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      u.searchParams.delete(key);
    }
    if ([...u.searchParams.keys()].length === 0) {
      u.search = "";
    }
  },

  // Conservative Amazon cleaner
  cleanAmazon(u) {
    // Avoid touching auth, payment, cart, and digital endpoints
    const p = u.pathname;
    if (
      p.startsWith("/ap/") || // auth
      p.startsWith("/gp/buy/") || // checkout
      p.startsWith("/cart/") || // cart
      p.startsWith("/hz/") || // internal flows
      p.startsWith("/gp/video/") || // prime video
      p.startsWith("/sspa/") // sponsored flows
    ) {
      return;
    }

    // Extract ASIN if present, then canonicalize
    // Matches /dp/<ASIN> or /gp/product/<ASIN> or /gp/aw/d/<ASIN>
    const asinMatch =
      p.match(/\/dp\/([A-Z0-9]{10})/i) ||
      p.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
      p.match(/\/gp\/aw\/d\/([A-Z0-9]{10})/i);

    if (asinMatch) {
      const asin = asinMatch[1].toUpperCase();
      u.pathname = `/dp/${asin}`;
      // For canonical product URLs, aggressively remove ALL query parameters.
      // No parameters are needed for the page to load correctly.
      u.search = "";
      u.hash = "";
      return;
    }

    // For general Amazon links (search, lists), strip marketing trash
    // but preserve essential search intent.
    const allowed = new Set([
      // keep only intent parameters for search/browse
      "k", // search keywords
      "rh", // filters
      "bbn", // browse node
      "i", // department
      "node", // node
    ]);
    this.stripParams(u, allowed, /* preserveCase */ false);
  },

  /**
   * Clean YouTube URLs by removing unnecessary parameters and canonicalizing the path.
   * @param {URL} u URL instance to sanitize and normalize for playback.
   * @returns {void}
   */
  cleanYouTube(u) {
    if (this.isYouTubeRedirectPath(u)) {
      return;
    }

    if (this.normalizeYouTubeSpecialPaths(u)) {
      return;
    }

    if (u.pathname === "/watch") {
      this.sanitizeYouTubeWatch(u);
    }
  },

  cleanYouTubeShort(u) {
    const videoId = this.extractShortVideoId(u);
    if (!this.isLikelyYouTubeId(videoId)) {
      return;
    }

    const context = this.collectYouTubePlaybackContext(u);
    this.transformToYouTubeWatch(u, videoId, context);
  },
  cleanEbay(u) {
    // Keep intent: item id, query terms; drop marketing noise (mkcid, mkevt, campid, customid, etc.)
    const allow = new Set([
      "_nkw",
      "_sop",
      "_udlo",
      "_udhi",
      "_pgn",
      "rt",
      "hash",
      "nid",
      "epid",
      "mkrid",
      "_from",
      "_trksid",
    ]);
    this.stripParams(u, allow, false);
    // Remove hash marketing fragments like #itmhash
    if (u.hash && /itm|mkcid|campid|mkevt/i.test(u.hash)) {
      u.hash = "";
    }
  },

  // Remove tracking params globally, preserving an allowlist if provided
  stripParams(u, allowlist = new Set(), preserveCase = false) {
    const params = u.searchParams;
    // Build list to delete to avoid mutating while iterating
    const toDelete = [];
    for (const [key, value] of params.entries()) {
      if (this.shouldStripParam(key, value, allowlist, preserveCase)) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      params.delete(key);
    }
    // Remove Amazon-only "/ref=" path segments
    if (/(?:^|\.)amazon\./i.test(u.hostname)) {
      u.pathname = u.pathname.replaceAll(/\/ref=[^/]+/gi, "");
    }
    // Drop dangling '?' if nothing remains
    if ([...u.searchParams.keys()].length === 0) {
      u.search = "";
    }
  },

  // Resolve known redirectors: if ?u= or ?url= present, replace with inner URL
  resolveRedirector(u) {
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    for (const rule of this.REDIRECTORS) {
      if (!this.matchesRedirectRule(rule, host, path)) {
        continue;
      }

      const target = this.extractRedirectTarget(u, rule);
      if (target) {
        return target;
      }
    }
    return null;
  },

  // Normalize (lowercase host, remove default ports, collapse duplicate encoding)
  normalize(u) {
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === "http:" && u.port === "80") ||
      (u.protocol === "https:" && u.port === "443")
    ) {
      u.port = "";
    }
    // collapse multiple slashes except after protocol
    u.pathname = u.pathname.replaceAll(/\/{2,}/g, "/");
    // strip empty query
    if ([...u.searchParams.keys()].length === 0) {
      u.search = "";
    }
  },

  resolveBase(base) {
    try {
      if (base) {
        return base;
      }
      if (typeof document !== "undefined" && document.baseURI) {
        return document.baseURI;
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof location !== "undefined" && location.href) {
        return location.href;
      }
    } catch {
      /* ignore */
    }
  },

  // Main entry: returns cleaned href as string
  cleanHref(input, base) {
    if (typeof input === "string" && input.trim().toLowerCase().startsWith(JAVASCRIPT_PROTOCOL)) {
      return "about:blank";
    }

    const resolvedBase = this.resolveBase(base);
    let u;
    try {
      u = resolvedBase ? new URL(input, resolvedBase) : new URL(input);
    } catch {
      return input; // non-URL or malformed
    }

    // Don’t touch internal schemes
    const s = u.protocol + "";
    if (s === JAVASCRIPT_PROTOCOL) {
      return "about:blank";
    }
    if (s === "data:" || s === "blob:" || s === "about:") {
      return u.toString();
    }

    // Try to unwrap redirectors
    const unwrapped = this.resolveRedirector(u);
    if (unwrapped) {
      u = unwrapped;
    }

    // Global param strip
    this.stripParams(u);

    // Domain-specific tweaks
    this.byDomain(u);

    // Normalize
    this.normalize(u);

    return u.toString();
  },
};
