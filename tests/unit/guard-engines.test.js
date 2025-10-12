import { ensureEngines, getNpmVersion, validateEngines } from "../../scripts/guard-engines.js";

describe("guard-engines", () => {
  describe("validateEngines", () => {
    it("returns detected versions when requirements are satisfied", () => {
      const result = validateEngines({
        nodeVersion: "24.1.0",
        npmVersion: "11.0.0",
      });

      expect(result).toEqual({
        nodeVersion: "24.1.0",
        npmVersion: "11.0.0",
      });
    });

    it("throws when either engine falls below required majors", () => {
      expect(() =>
        validateEngines({
          nodeVersion: "23.5.0",
          npmVersion: "10.9.0",
        }),
      ).toThrow("[engines] Node >=24 and npm >=11 are required.");
    });
  });

  describe("getNpmVersion", () => {
    it("prefers npm_config_user_agent when available", () => {
      const env = {
        npm_config_user_agent: "npm/11.2.0 node/v24.0.0 linux x64",
      };

      expect(getNpmVersion({ env })).toBe("11.2.0");
    });

    it("falls back to npm_config_npm_version", () => {
      const env = {
        npm_config_npm_version: "12.1.0",
      };

      expect(getNpmVersion({ env })).toBe("12.1.0");
    });

    it("throws when no npm version source is available", () => {
      expect(() => getNpmVersion({ env: {} })).toThrow(
        "Unable to determine npm version from environment.",
      );
    });
  });

  describe("ensureEngines", () => {
    it("validates using the provided environment snapshot", () => {
      const env = {
        npm_config_user_agent: "npm/11.5.1 node/v24.1.0 linux x64",
      };

      const result = ensureEngines({
        env,
        nodeVersion: "24.8.0",
        requiredNodeMajor: 24,
        requiredNpmMajor: 11,
      });

      expect(result).toEqual({
        nodeVersion: "24.8.0",
        npmVersion: "11.5.1",
      });
    });
  });
});
