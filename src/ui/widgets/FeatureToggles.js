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

  group.append(imgPixels.element);

  return {
    element: group,
    syncFromState() {
      imgPixels.setState(guard.isFeatureEnabled("imgPixels"));
    },
  };
}
