export default {
  // Auto-clear and restore spies/mocks between tests.
  clearMocks: true,
  restoreMocks: true,

  // Use a DOM-like environment for tests that touch `document`, `window`, or `location`.
  testEnvironment: "jsdom",

  // Make jsdom's URL stable to avoid hostname-origin flakiness in tests.
  testEnvironmentOptions: {
    url: "https://example.test/",
  },

  // Look for modules under src/ when resolving imports.
  roots: ["<rootDir>/src", "<rootDir>/tests"],

  // Discover *.test.* or *.spec.* files within the dedicated tests/ folder.
  testMatch: [
    "<rootDir>/tests/**/*.{spec,test}.js",
    "<rootDir>/tests/**/*.{spec,test}.mjs",
    "<rootDir>/tests/**/*.{spec,test}.cjs",
  ],

  // Mock non-JS assets to prevent parsing errors.
  moduleNameMapper: {
    "\\.css$": "<rootDir>/tests/setup/fileMock.js",
  },

  // Run setup code after the test environment is ready (per test file).
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.js"],

  // (Optional) Native coverage; add patterns if/when you need reports.
  // coverageProvider: "v8",
  // collectCoverageFrom: ["src/**/*.js", "!src/**/?(*.)+(spec|test).[cm]js"],

  // (Optional) Add custom reporters in CI only.
  // reporters: ["default", ["jest-junit", { outputDirectory: "reports/junit" }]],
};
