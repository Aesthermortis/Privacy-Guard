import { FEATURES } from "../config.js";

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

  // Domain-specific rules (lower priority than redirect resolution)
  byDomain(u) {
    const host = u.hostname.toLowerCase();

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
      (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com")
    ) {
      this.cleanYouTube(u);
      return;
    }
    if (FEATURES.rules.youtube && host === "youtu.be") {
      this.cleanYouTuBeShort(u);
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
      return;
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
    this.stripParams(u, allowed, /* preserveCase*/ false);
  },

  cleanYouTube(u) {
    // Canonicalize watch URLs: keep essential intent (v, t, list/index for playlists)
    // Remove share/tracking junk (si, pp, feature, ab_channel, etc.)
    if (u.pathname === "/redirect") {
      // Will be handled by resolveRedirector
      return;
    }
    if (u.pathname !== "/watch" && u.pathname.startsWith("/shorts/")) {
      // Convert shorts to watch
      const id = u.pathname.split("/")[2];
      if (id) {
        u.pathname = "/watch";
        u.search = "";
        u.searchParams.set("v", id);
      }
    }
    if (u.pathname === "/watch") {
      const allow = new Set(["v", "t", "list", "index"]);
      this.stripParams(u, allow, false);
      // Normalize host
      u.hostname = "www.youtube.com";
    }
  },

  cleanYouTuBeShort(u) {
    // youtu.be/<id>?t=xx => https://www.youtube.com/watch?v=<id>&t=xx
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts[0];
    if (id && id.length > 5) {
      const keepT = u.searchParams.get("t");
      u.hostname = "www.youtube.com";
      u.pathname = "/watch";
      u.search = "";
      u.searchParams.set("v", id);
      if (keepT) {
        u.searchParams.set("t", keepT);
      }
    }
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
    for (const [k, v] of params.entries()) {
      const keyLC = k.toLowerCase();
      const inAllow = preserveCase ? allowlist.has(k) : allowlist.has(keyLC);
      if (!inAllow && (this.GLOBAL_STRIP.has(keyLC) || keyLC.startsWith("utm_"))) {
        toDelete.push(k);
        continue;
      }
      // Amazon-specific noisy params to remove unless explicitly allowed
      if (
        !inAllow &&
        (v === "" ||
          keyLC === "ref" ||
          keyLC === "ref_src" ||
          keyLC === "ref_url" ||
          keyLC.startsWith("ref_") ||
          keyLC === "_encoding" ||
          keyLC.startsWith("pf_rd_") ||
          keyLC.startsWith("pd_rd_") ||
          keyLC === "content-id" ||
          keyLC === "si" ||
          keyLC === "pp" ||
          keyLC === "feature" ||
          keyLC === "ab_channel")
      ) {
        toDelete.push(k);
        continue;
      }
    }
    for (const k of toDelete) {
      params.delete(k);
    }
    // Remove trailing "ref" segments from path e.g., /dp/ASIN/ref=something
    u.pathname = u.pathname.replace(/\/ref=[^/]+$/i, "");
    // Drop dangling '?' if nothing remains
    if ([...u.searchParams.keys()].length === 0) {
      u.search = "";
    }
  },

  // Resolve known redirectors: if ?u= or ?url= present, replace with inner URL
  resolveRedirector(u) {
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    for (const r of this.REDIRECTORS) {
      if (host.includes(r.hostIncludes) && (!r.pathHas || path.includes(r.pathHas))) {
        for (const name of r.param) {
          const target = u.searchParams.get(name);
          if (target) {
            try {
              return new URL(target);
            } catch {
              // sometimes the value is encoded twice
              try {
                return new URL(decodeURIComponent(target));
              } catch {
                /* ignore */
              }
            }
          }
        }
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
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
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
    return undefined;
  },

  // Main entry: returns cleaned href as string
  cleanHref(input, base) {
    const resolvedBase = this.resolveBase(base);
    let u;
    try {
      u = resolvedBase ? new URL(input, resolvedBase) : new URL(input);
    } catch {
      return input; // non-URL or malformed
    }

    // Don’t touch internal schemes
    const s = u.protocol + "";
    if (s === "javascript:" || s === "data:" || s === "blob:" || s === "about:") {
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
