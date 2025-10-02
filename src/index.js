import { applyOverridesForHost } from "./config.js";
import { STORAGE } from "./storage.js";
import { PrivacyGuard } from "./core/privacy-guard.js";
import { setupUIPanel } from "./ui/panel.js";
import { logError } from "./core/errors.js";

try {
  applyOverridesForHost(location.hostname, STORAGE);
} catch (err) {
  logError("Failed to apply per-host overrides.", err, { onceKey: "init-overrides" });
}

setupUIPanel();

PrivacyGuard.init();
