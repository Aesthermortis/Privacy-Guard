import { createPgSwitch } from "../components/PgSwitch.js";

/**
 * Creates the composite widget with WebSocket and SSE toggles.
 * @param {{ isChannelEnabled: (kind: string) => boolean, setChannelEnabled: (kind: string, enabled: boolean) => void }} guard - Privacy Guard controller.
 * @returns {{ element: HTMLElement, syncFromState: () => void }} - Widget container and sync helper.
 */
export function createChannelToggles(guard) {
  const group = document.createElement("div");
  group.className = "pg-switch-group";

  const ws = createPgSwitch({
    id: "pg-sw-ws",
    label: "WebSocket",
    description: "Block tracker-grade WebSocket connections.",
    initial: guard.isChannelEnabled("ws"),
    onChange: (on) => {
      guard.setChannelEnabled("ws", on);
    },
  });

  const sse = createPgSwitch({
    id: "pg-sw-sse",
    label: "EventSource (SSE)",
    description: "Block suspicious EventSource streams.",
    initial: guard.isChannelEnabled("sse"),
    onChange: (on) => {
      guard.setChannelEnabled("sse", on);
    },
  });

  group.append(ws.element, sse.element);

  return {
    element: group,
    syncFromState() {
      ws.setState(guard.isChannelEnabled("ws"));
      sse.setState(guard.isChannelEnabled("sse"));
    },
  };
}
