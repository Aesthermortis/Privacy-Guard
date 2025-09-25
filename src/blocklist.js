export const BLOCKED_HOSTS = [
  // Google
  "doubleclick.net",
  "adservice.google.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googlesyndication.com",
  "imasdk.googleapis.com",
  "collector.github.com",
  "ads.google.com",

  // Netpub ad/CDN
  "fstatic.netpub.media",

  // Dropbox telemetry
  "beacon.dropbox.com",

  // Yandex Metrika
  "mc.yandex.ru",

  // Mail.ru ads/metrics
  "top-fwz1.mail.ru",
  "ad.mail.ru",

  // AppTracer (perf/crash uploads)
  "sdk-api.apptracer.ru",

  // Dzen.ru telemetry
  "telemetry.dzen.ru",

  // Overbridge analytics
  "overbridgenet.com",

  // Rumble ads
  "a.ads.rmbl.ws",
];

export const BLOCKED_RULES = [
  // Facebook
  { host: "facebook.com", pathStartsWith: "/plugins" },
  { host: "facebook.com", pathStartsWith: "/v" }, // Covers /vXX.X/

  // Github private telemetry endpoints
  { host: "api.github.com", pathStartsWith: "/_private/browser/stats" },

  // ChatGPT
  { host: "chatgpt.com", pathStartsWith: "/ces/" },

  // Dropbox logs/telemetry
  { host: "dropbox.com", pathStartsWith: "/log/" },

  // Yandex ads
  { host: "yandex.ru", pathStartsWith: "/ads/" },
];
