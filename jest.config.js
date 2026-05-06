// @ts-check

/** @type {import("jest").Config} */
const config = {
  // Auto-clear and restore spies/mocks between tests.
  clearMocks: true,

  // Collect coverage from source files, excluding test files.
  collectCoverageFrom: ["src/**/*.js", "!src/**/?(*.)+(spec|test).[cm]js"],

  // Use V8's built-in code coverage for faster and more accurate results.
  coverageProvider: "v8",

  // Mock non-JS assets to prevent parsing errors.
  moduleNameMapper: {
    "\\.(css|less)$": "<rootDir>/tests/setup/styleMock.js",
    "\\.(gif|ttf|eot|svg)$": "<rootDir>/tests/setup/fileMock.js",
    "\\.html$": "<rootDir>/tests/setup/htmlMock.js",
  },

  // Automatically restore spies/mocks to their original implementations.
  restoreMocks: true,

  // Look for modules under src/ when resolving imports.
  roots: ["<rootDir>/src", "<rootDir>/tests"],

  // Run setup code after the test environment is ready (per test file).
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.js"],

  // Use a DOM-like environment for tests that touch `document`, `window`, or `location`.
  testEnvironment: "jsdom",

  // Make jsdom's URL stable to avoid hostname-origin flakiness in tests.
  testEnvironmentOptions: {
    url: "https://example.test/",
  },
  // Discover *.test.* or *.spec.* files within the dedicated tests/ folder.
  testMatch: ["<rootDir>/tests/**/*.{spec,test}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],

  // (Optional) Add custom reporters in CI only.
  // reporters: ["default", ["jest-junit", { outputDirectory: "reports/junit" }]],
};

export default config;
