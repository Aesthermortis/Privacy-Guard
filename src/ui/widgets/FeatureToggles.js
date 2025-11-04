import { createPgSwitch } from "../components/PgSwitch.js";

/**
 * Builds the widget with feature-level toggles.
 * @param {{ isFeatureEnabled: (id: string) => boolean, setFeatureEnabled: (id: string, enabled: boolean) => void }} guard - Privacy Guard controller.
 * @returns {{ element: HTMLElement, syncFromState: () => void }} Widget container and sync helper.
 */
export function createFeatureToggles(guard) {
  const group = document.createElement("div");
  group.className = "pg-switch-group";

  const imgPixels = createPgSwitch({
    id: "pg-sw-imgpixels",
    label: "Block IMG pixels",
    description: "Stop image-based tracking beacons.",
    initial: guard.isFeatureEnabled("imgPixels"),
    onChange: (on) => {
      guard.setFeatureEnabled("imgPixels", on);
    },
  });

  const cmpNegation = createPgSwitch({
    id: "pg-sw-cmpnegation",
    label: "Refuse consent dialogs",
    description: "Auto-decline CMPs and prevent their scripts from loading.",
    initial: guard.isFeatureEnabled("cmpNegation"),
    onChange: (on) => {
      guard.setFeatureEnabled("cmpNegation", on);
    },
  });

  const cmpStrictMode = createPgSwitch({
    id: "pg-sw-cmpstrict",
    label: "Strict CMP detection",
    description: "Block heuristically matched CMP resources.",
    initial: guard.isFeatureEnabled("cmpStrictMode"),
    onChange: (on) => {
      guard.setFeatureEnabled("cmpStrictMode", on);
    },
  });

  group.append(cmpNegation.element);
  group.append(cmpStrictMode.element);
  group.append(imgPixels.element);

  return {
    element: group,
    syncFromState() {
      cmpNegation.setState(guard.isFeatureEnabled("cmpNegation"));
      cmpStrictMode.setState(guard.isFeatureEnabled("cmpStrictMode"));
      imgPixels.setState(guard.isFeatureEnabled("imgPixels"));
    },
  };
}
