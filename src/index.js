import { applyOverridesForHost } from "./config.js";
import { STORAGE } from "./storage.js";
import { PrivacyGuard } from "./core/privacy-guard.js";
import { setupUIPanel } from "./ui/panel.js";

try {
  applyOverridesForHost(location.hostname, STORAGE);
} catch {
  /* ignore */
}

setupUIPanel();

PrivacyGuard.init();
