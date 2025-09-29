import { applyOverridesForHost } from "./config.js";
import { STORAGE } from "./storage.js";
import { PrivacyGuard } from "./core/privacy-guard.js";
import { setupUIPanel } from "./ui/panel.js";

try {
  applyOverridesForHost(location.hostname, STORAGE);
} catch (e) {
  console.error("PrivacyGuard: Failed to apply per-host overrides.", e);
}

setupUIPanel();

PrivacyGuard.init();
