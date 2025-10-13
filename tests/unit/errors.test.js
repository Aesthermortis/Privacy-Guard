import { jest } from "@jest/globals";

describe("error utils", () => {
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("toError turns strings into Error", async () => {
    const { toError } = await import("../../src/core/errors.js");
    const error = toError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
  });

  it("logError prints with prefix and normalized Error", async () => {
    const { logError } = await import("../../src/core/errors.js");
    const payload = { message: "nope" };

    logError("Something failed.", payload);

    expect(errorSpy).toHaveBeenCalledOnce();
    const [message, errObj] = errorSpy.mock.calls[0];
    expect(message).toBe("PrivacyGuard: Something failed.");
    expect(errObj).toBeInstanceOf(Error);
    expect(errObj.message).toBe(JSON.stringify(payload));
  });

  it("logError de-duplicates when onceKey matches", async () => {
    const { logError } = await import("../../src/core/errors.js");
    const err = new Error("same");

    logError("Repeat me", err, { onceKey: "group-1" });
    logError("Repeat me", err, { onceKey: "group-1" });

    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("logError can rethrow when requested", async () => {
    const { logError } = await import("../../src/core/errors.js");

    expect(() => {
      try {
        throw new Error("kaboom");
      } catch (error) {
        logError("Exploding on purpose.", error, { rethrow: true });
      }
    }).toThrow("kaboom");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
