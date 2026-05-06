import "jest-extended/all";
import "@testing-library/jest-dom";

// Silence noisy logs during tests to keep output readable.
// Adjust the log levels you want to mute.
// Optional: common helpers, custom matchers, or global test data.
// Example: a simple helper to create DOM containers per test file.
beforeEach(() => {
  jest.spyOn(console, "debug").mockImplementation(() => null);
  jest.spyOn(console, "info").mockImplementation(() => null);

  const mount = document.createElement("div");
  mount.id = "test-root";
  document.body.append(mount);
});

afterEach(() => {
  jest.restoreAllMocks();
  document.querySelector("#test-root")?.remove();
});
