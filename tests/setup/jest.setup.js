import { jest } from "@jest/globals";
// Silence noisy logs during tests to keep output readable.
// Adjust the log levels you want to mute.
beforeAll(() => {
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});

// Ensure console methods are restored after the full test run.
afterAll(() => {
  console.debug.mockRestore?.();
  console.info.mockRestore?.();
});

// Optional: common helpers, custom matchers, or global test data.
// Example: a simple helper to create DOM containers per test file.
beforeEach(() => {
  const mount = document.createElement("div");
  mount.id = "test-root";
  document.body.appendChild(mount);
});

afterEach(() => {
  const mount = document.getElementById("test-root");
  if (mount && mount.parentNode) {
    mount.parentNode.removeChild(mount);
  }
});
