export const BLOCKED_HOSTS = [
  // Google
  "doubleclick.net",
  "adservice.google.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googlesyndication.com",
  "imasdk.googleapis.com",
  "collector.github.com",
  // Netpub ad/CDN
  "fstatic.netpub.media",
  // Dropbox telemetry
  "beacon.dropbox.com",
];

export const BLOCKED_RULES = [
  // Facebook
  { host: "facebook.com", pathStartsWith: "/plugins" },
  { host: "facebook.com", pathStartsWith: "/v" }, // Covers /vXX.X/
  // Github private telemetry endpoints
  { host: "api.github.com", pathStartsWith: "/_private/browser/stats" },
  // ChatGPT
  { host: "chatgpt.com", pathStartsWith: "/ces/" },
  // Other common trackers
  { host: "overbridgenet.com", pathStartsWith: "/jsv8/offer" },
  // Dropbox logs/telemetry
  { host: "dropbox.com", pathStartsWith: "/log/" },
];
