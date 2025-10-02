import { jest } from "@jest/globals";

// Note: We are intentionally not using top-level jest.mock() here, as it has
// proven to be incompatible with this project's Jest and ES module setup,
// causing "require is not defined" errors.

describe("Initialization", () => {
  let errorSpy;

  beforeEach(() => {
    // Spy on console.error to track logging.
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // Reset modules to ensure the top-level code in index.js runs for each test.
    jest.resetModules();
  });

  afterEach(() => {
    // Restore all mocks.
    jest.restoreAllMocks();
  });

  it("should log an error if applying overrides fails", async () => {
    // Arrange:
    // 1. Dynamically import the module whose method we need to spy on.
    //    This must be done *after* jest.resetModules() to get the new instance.
    const { STORAGE } = await import("../../src/storage.js");
    const testError = new Error("Storage failure");
    // 2. Spy on the 'get' method and make it throw.
    jest.spyOn(STORAGE, "get").mockImplementation(() => {
      throw testError;
    });

    // Act:
    // Dynamically import the module under test. It will receive the same
    // STORAGE instance we just spied on.
    await import("../../src/index.js");

    // Assert:
    // Verify the error was caught and logged.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "PrivacyGuard: Failed to apply per-host overrides.",
      testError,
    );
  });

  it("should not log an error if applying overrides succeeds", async () => {
    // Arrange:
    // Set up a successful implementation for the storage method.
    const { STORAGE } = await import("../../src/storage.js");
    jest.spyOn(STORAGE, "get").mockReturnValue({ enabled: true });

    // Act:
    // Import the module under test.
    await import("../../src/index.js");

    // Assert:
    // Verify that no error was logged.
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
