import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { valid as semverValid } from "semver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reads the userscript metadata banner.
 * @returns {string} The metadata block for the userscript.
 */
const getMetadata = () => {
  return readFileSync(path.resolve(__dirname, "src", "metadata.txt"), "utf8");
};

/**
 * Gets the version from the environment variable.
 * @returns {string} The version from the environment variable, or empty string if not found.
 */
const getVersionFromEnv = () => (process.env.USERSCRIPT_VERSION || "").trim();

/**
 * Extracts the version from the GitHub Actions tag if present.
 * @returns {string} The version from the tag (e.g. '1.6.1'), or empty string if not found.
 */
const getVersionFromTag = () => {
  const refName = process.env.GITHUB_REF_NAME || "";
  return refName.startsWith("v") ? refName.slice(1) : "";
};

/**
 * Reads the version from package.json.
 * @returns {string} The version from package.json, or '0.0.0' as fallback.
 */
const getVersionFromPackage = () => {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
};

const isValidSemver = (rawVersion) => {
  if (typeof rawVersion !== "string") {
    return false;
  }

  const version = rawVersion.trim();
  if (version === "") {
    return false;
  }

  return semverValid(version) !== null;
};

/**
 * Inserts the resolved version into the userscript metadata banner.
 * @param {string} banner - The original metadata banner.
 * @param {string} version - The version to inject.
 * @returns {string} The updated metadata banner.
 */
const injectVersionIntoBanner = (banner, version) => {
  if (!isValidSemver(version)) {
    throw new Error("❌ No valid version found for userscript metadata.");
  }

  // Match the typical metadata line: "// @version    <optional value>"
  const lineRegex = /(^[ \t]*\/\/[ \t]*@version[ \t]+)([^\r\n]*)/m;

  if (!lineRegex.test(banner)) {
    throw new Error("❌ No @version line found in userscript metadata banner.");
  }

  // Ensure there's only one @version line
  const occurrences = banner.match(/^[ \t]*\/\/[ \t]*@version[ \t]+/gm);
  if (occurrences && occurrences.length > 1) {
    throw new Error("Multiple @version lines found in metadata banner.");
  }

  return banner.replace(lineRegex, `$1${version}`);
};

// Determine the version to use, prioritizing environment variable, then Git tag, then package.json
const resolvedVersion = getVersionFromEnv() || getVersionFromTag() || getVersionFromPackage();
const metadata = injectVersionIntoBanner(getMetadata(), resolvedVersion);

/**
 * Rollup plugin to import CSS as JS strings.
 * @type {import('rollup').Plugin}
 */
const cssAsStringPlugin = {
  name: "css-as-string",
  transform(code, id) {
    if (!id.endsWith(".css")) {
      return;
    }
    return {
      code: `export default ${JSON.stringify(code)};`,
      map: { mappings: "" },
    };
  },
};

export default {
  input: "src/index.js",
  output: {
    file: "dist/privacy-guard.user.js",
    format: "iife",
    banner: metadata,
    strict: false,
  },
  treeshake: true,
  plugins: [cssAsStringPlugin],
};
