import { jest } from "@jest/globals";
import { MODE } from "../../src/config.js";
import { PrivacyGuard } from "../../src/core/privacy-guard.js";
import { EventLog } from "../../src/event-log.js";

const flushMicrotasks = () => {
  if (typeof queueMicrotask === "function") {
    return new Promise((resolve) => queueMicrotask(resolve));
  }
  return Promise.resolve();
};

const baselineChannelState = { ...PrivacyGuard.STATE.channelEnabled };

describe("PrivacyGuard.interceptEventSource", () => {
  let originalEventSource;
  let eventLogPushSpy;
  let FakeEventSource;

  beforeAll(() => {
    originalEventSource = globalThis.EventSource;
  });

  beforeEach(() => {
    FakeEventSource = jest.fn(function FakeEventSource(url, init) {
      this.url = String(url);
      this.init = init;
      this.readyState = FakeEventSource.CONNECTING;
      this.withCredentials = Boolean(init?.withCredentials);
    });
    FakeEventSource.CONNECTING = 0;
    FakeEventSource.OPEN = 1;
    FakeEventSource.CLOSED = 2;
    FakeEventSource.prototype = {
      close: jest.fn(),
    };

    globalThis.EventSource = FakeEventSource;

    eventLogPushSpy = jest.spyOn(EventLog, "push").mockImplementation(() => {});

    MODE.networkBlock = "fail";
    PrivacyGuard.STATE.channelEnabled.ws = baselineChannelState.ws;
    PrivacyGuard.STATE.channelEnabled.sse = baselineChannelState.sse;
  });

  afterEach(() => {
    eventLogPushSpy.mockRestore();

    MODE.networkBlock = "fail";
    PrivacyGuard.STATE.channelEnabled.ws = baselineChannelState.ws;
    PrivacyGuard.STATE.channelEnabled.sse = baselineChannelState.sse;

    globalThis.EventSource = originalEventSource;
  });

  afterAll(() => {
    globalThis.EventSource = originalEventSource;
  });

  test("allows native EventSource when SSE channel is disabled", () => {
    PrivacyGuard.STATE.channelEnabled.sse = false;

    const shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(true);

    PrivacyGuard.interceptEventSource();

    const eventSource = new EventSource("https://tracker.test/stream");
    try {
      expect(eventSource).toBeInstanceOf(FakeEventSource);
    } finally {
      eventSource.close();
    }

    expect(FakeEventSource).toHaveBeenCalledOnce();
    expect(FakeEventSource).toHaveBeenCalledWith("https://tracker.test/stream");
    expect(shouldBlockSpy).not.toHaveBeenCalled();
    expect(eventLogPushSpy).not.toHaveBeenCalled();

    shouldBlockSpy.mockRestore();
  });

  test("returns inert EventSource stub when blocking in silent mode", async () => {
    MODE.networkBlock = "silent";
    const shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(true);

    PrivacyGuard.interceptEventSource();

    const stub = new EventSource("https://tracker.test/stream", { withCredentials: true });

    expect(FakeEventSource).not.toHaveBeenCalled();
    expect(shouldBlockSpy).toHaveBeenCalledWith("https://tracker.test/stream");
    expect(eventLogPushSpy).toHaveBeenCalledOnce();
    expect(eventLogPushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sse",
        reason: "silent",
        url: "https://tracker.test/stream",
      }),
    );

    expect(stub.url).toBe("https://tracker.test/stream");
    expect(stub.withCredentials).toBeTrue();
    expect(stub.readyState).toBe(FakeEventSource.CLOSED);
    expect(typeof stub.close).toBe("function");
    expect(typeof stub.addEventListener).toBe("function");

    const customListener = jest.fn();
    stub.addEventListener("custom", customListener);
    stub.dispatchEvent(new Event("custom"));
    expect(customListener).toHaveBeenCalledOnce();

    const errorListener = jest.fn();
    stub.addEventListener("error", errorListener);
    await flushMicrotasks();
    expect(errorListener).not.toHaveBeenCalled();

    shouldBlockSpy.mockRestore();
  });

  test("throws when blocking EventSource in fail mode", () => {
    MODE.networkBlock = "fail";
    const shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(true);

    PrivacyGuard.interceptEventSource();

    expect(() => new EventSource("https://tracker.test/stream")).toThrow(
      new TypeError("PrivacyGuard blocked EventSource: https://tracker.test/stream"),
    );
    expect(FakeEventSource).not.toHaveBeenCalled();
    expect(eventLogPushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sse",
        reason: "fail",
        url: "https://tracker.test/stream",
      }),
    );

    shouldBlockSpy.mockRestore();
  });
});

describe("PrivacyGuard.interceptWebSocket", () => {
  let originalWebSocket;
  let originalMozWebSocket;
  let originalCloseEvent;
  let eventLogPushSpy;
  let FakeWebSocket;

  beforeAll(() => {
    originalWebSocket = globalThis.WebSocket;
    originalMozWebSocket = globalThis.MozWebSocket;
    originalCloseEvent = globalThis.CloseEvent;
  });

  beforeEach(() => {
    FakeWebSocket = jest.fn(function FakeWebSocket(url, protocols) {
      this.url = String(url);
      this.protocols = protocols;
      this.readyState = FakeWebSocket.CONNECTING;
    });
    FakeWebSocket.CONNECTING = 0;
    FakeWebSocket.OPEN = 1;
    FakeWebSocket.CLOSING = 2;
    FakeWebSocket.CLOSED = 3;
    FakeWebSocket.prototype = {
      close: jest.fn(),
      send: jest.fn(),
      readyState: FakeWebSocket.CONNECTING,
    };

    globalThis.WebSocket = FakeWebSocket;
    globalThis.MozWebSocket = FakeWebSocket;
    globalThis.CloseEvent = undefined;

    eventLogPushSpy = jest.spyOn(EventLog, "push").mockImplementation(() => {});

    MODE.networkBlock = "fail";
    PrivacyGuard.STATE.channelEnabled.ws = baselineChannelState.ws;
    PrivacyGuard.STATE.channelEnabled.sse = baselineChannelState.sse;
  });

  afterEach(() => {
    eventLogPushSpy.mockRestore();

    MODE.networkBlock = "fail";
    PrivacyGuard.STATE.channelEnabled.ws = baselineChannelState.ws;
    PrivacyGuard.STATE.channelEnabled.sse = baselineChannelState.sse;

    if (originalWebSocket === undefined) {
      delete globalThis.WebSocket;
    } else {
      globalThis.WebSocket = originalWebSocket;
    }
    if (originalMozWebSocket === undefined) {
      delete globalThis.MozWebSocket;
    } else {
      globalThis.MozWebSocket = originalMozWebSocket;
    }
    if (originalCloseEvent === undefined) {
      delete globalThis.CloseEvent;
    } else {
      globalThis.CloseEvent = originalCloseEvent;
    }
  });

  test("allows native WebSocket when channel is disabled", () => {
    PrivacyGuard.STATE.channelEnabled.ws = false;
    const shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(true);

    PrivacyGuard.interceptWebSocket();

    const webSocket = new WebSocket("wss://tracker.test/socket", ["json"]);
    try {
      expect(webSocket).toBeInstanceOf(FakeWebSocket);
    } finally {
      webSocket.close();
    }

    expect(FakeWebSocket).toHaveBeenCalledOnce();
    expect(FakeWebSocket).toHaveBeenCalledWith("wss://tracker.test/socket", ["json"]);
    expect(shouldBlockSpy).not.toHaveBeenCalled();
    expect(eventLogPushSpy).not.toHaveBeenCalled();

    shouldBlockSpy.mockRestore();
  });

  test("returns silent WebSocket stub when blocking silently", async () => {
    MODE.networkBlock = "silent";
    const shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(true);

    PrivacyGuard.interceptWebSocket();

    const stub = new WebSocket("wss://tracker.test/socket");

    expect(FakeWebSocket).not.toHaveBeenCalled();
    expect(shouldBlockSpy).toHaveBeenCalledWith("wss://tracker.test/socket");
    expect(eventLogPushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "websocket",
        reason: "silent",
        url: "wss://tracker.test/socket",
      }),
    );

    expect(stub.readyState).toBe(FakeWebSocket.CLOSED);
    expect(typeof stub.send).toBe("function");
    expect(typeof stub.addEventListener).toBe("function");

    const closeListener = jest.fn();
    const errorListener = jest.fn();
    stub.addEventListener("close", closeListener);
    stub.addEventListener("error", errorListener);

    await flushMicrotasks();

    expect(closeListener).toHaveBeenCalledOnce();
    expect(errorListener).not.toHaveBeenCalled();
    expect(globalThis.MozWebSocket).toBe(globalThis.WebSocket);

    shouldBlockSpy.mockRestore();
  });

  test("throws when blocking WebSocket in fail mode", () => {
    MODE.networkBlock = "fail";
    const shouldBlockSpy = jest.spyOn(PrivacyGuard, "shouldBlock").mockReturnValue(true);

    PrivacyGuard.interceptWebSocket();

    expect(() => new WebSocket("wss://tracker.test/socket")).toThrow(
      new TypeError("PrivacyGuard blocked WebSocket: wss://tracker.test/socket"),
    );
    expect(FakeWebSocket).not.toHaveBeenCalled();
    expect(eventLogPushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "websocket",
        reason: "fail",
        url: "wss://tracker.test/socket",
      }),
    );

    shouldBlockSpy.mockRestore();
  });
});
