// @ts-check

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reads the userscript metadata banner.
 *
 * @returns {string} The metadata block for the userscript.
 */
const getMetadata = () => {
  return readFileSync(path.resolve(__dirname, "src", "metadata.txt"), "utf8");
};

/**
 * Gets the version from the environment variable.
 *
 * @returns {string} The version from the environment variable, or empty string if not found.
 */
const getVersionFromEnv = () => (process.env.USERSCRIPT_VERSION ?? "").trim();

/**
 * Extracts the version from the GitHub Actions tag if present.
 *
 * @returns {string} The version from the tag (e.g. '1.6.1'), or empty string if not found.
 */
const getVersionFromTag = () => {
  const refName = process.env.GITHUB_REF_NAME ?? "";
  return refName.startsWith("v") ? refName.slice(1) : "";
};

/**
 * Reads the version from package.json.
 *
 * @returns {string} The version from package.json, or '0.0.0' as fallback.
 */
const getVersionFromPackage = () => {
  try {
    const packageJsonPath = path.resolve(__dirname, "package.json");
    const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
    const parsedPackageJson = /** @type {unknown} */ (JSON.parse(packageJsonRaw));
    if (typeof parsedPackageJson !== "object" || parsedPackageJson === null) {
      return "0.0.0";
    }

    const pkg = /** @type {Record<string, unknown>} */ (parsedPackageJson);
    const version = pkg.version;
    if (typeof version !== "string" || version === "") {
      return "0.0.0";
    }

    return version;
  } catch {
    return "0.0.0";
  }
};

/**
 * Splits a string into two parts based on the first occurrence of a separator.
 * If the separator is not found, the first part will be the entire string and the second part will be empty.
 *
 * @param {string} value - Source string.
 * @param {string} separator - First separator to split on.
 * @returns {[string, string]} Tuple with [left, rightOrEmpty].
 */
const splitOnce = (value, separator) => {
  const separatorIndex = value.indexOf(separator);
  if (separatorIndex === -1) {
    return [value, ""];
  }

  return [value.slice(0, separatorIndex), value.slice(separatorIndex + 1)];
};

/**
 * Checks if the given identifier consists of digits only.
 *
 * @param {string} identifier - Candidate numeric identifier.
 * @returns {boolean} True when identifier contains only ASCII digits.
 */
const isDigitsOnly = (identifier) => {
  return /^\d+$/u.test(identifier);
};

/**
 * Checks if the given identifier is alphanumeric with optional hyphens.
 *
 * @param {string} identifier - Candidate semver identifier.
 * @returns {boolean} True when identifier is alphanumeric with optional hyphens.
 */
const isAlphaNumHyphen = (identifier) => {
  return /^[0-9A-Za-z-]+$/u.test(identifier);
};

/**
 * Validates the core version segment of a semver string.
 *
 * @param {string} coreVersion - Core semver segment (major.minor.patch).
 * @returns {boolean} True when coreVersion is valid.
 */
const isValidCoreVersion = (coreVersion) => {
  const coreVersionParts = coreVersion.split(".");
  if (coreVersionParts.length !== 3) {
    return false;
  }

  return coreVersionParts.every((part) => {
    if (!isDigitsOnly(part)) {
      return false;
    }

    return !(part.length > 1 && part.startsWith("0"));
  });
};

/**
 * Validates the prerelease segment of a semver string.
 *
 * @param {string} prerelease - Prerelease segment.
 * @returns {boolean} True when prerelease identifiers are valid.
 */
const isValidPrerelease = (prerelease) => {
  if (prerelease === "") {
    return true;
  }

  const prereleaseIdentifiers = prerelease.split(".");
  return prereleaseIdentifiers.every((identifier) => {
    if (identifier === "" || !isAlphaNumHyphen(identifier)) {
      return false;
    }

    return !(isDigitsOnly(identifier) && identifier.length > 1 && identifier.startsWith("0"));
  });
};

/**
 * Validates the build metadata segment of a semver string.
 *
 * @param {string} buildMetadata - Build metadata segment.
 * @returns {boolean} True when build metadata identifiers are valid.
 */
const isValidBuildMetadata = (buildMetadata) => {
  if (buildMetadata === "") {
    return true;
  }

  const buildIdentifiers = buildMetadata.split(".");
  return buildIdentifiers.every((identifier) => identifier !== "" && isAlphaNumHyphen(identifier));
};

/**
 * Validates that a version string conforms to semver format (with optional leading "v").
 *
 * @param {string} rawVersion - Raw version string to validate.
 * @returns {boolean} True when rawVersion is a valid semver string.
 */
const isValidSemver = (rawVersion) => {
  if (typeof rawVersion !== "string") {
    return false;
  }

  const rawValue = rawVersion.trim();
  const version = rawValue.startsWith("v") ? rawValue.slice(1) : rawValue;
  if (version === "") {
    return false;
  }

  const [versionAndPrerelease, buildMetadata] = splitOnce(version, "+");
  const [coreVersion, prerelease] = splitOnce(versionAndPrerelease, "-");
  return (
    isValidBuildMetadata(buildMetadata) &&
    isValidCoreVersion(coreVersion) &&
    isValidPrerelease(prerelease)
  );
};

/**
 * Inserts the resolved version into the userscript metadata banner.
 *
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
 * Matcher used by the string loader to select files.
 *
 * @typedef {string | RegExp | ((id: string) => boolean)} StringLoaderMatcher
 */

/**
 * Configuration for the string loader plugin.
 *
 * @typedef {{
 *   include?: StringLoaderMatcher | StringLoaderMatcher[];
 *   exclude?: StringLoaderMatcher | StringLoaderMatcher[];
 * }} StringLoaderOptions
 */

/**
 * Converts string, regex, or function matchers into file predicates.
 * String matchers support extension suffixes (".html") and basic glob patterns for nested files.
 *
 * @param {StringLoaderMatcher | StringLoaderMatcher[]} matchers - One or more matchers.
 * @returns {((id: string) => boolean)[]} Predicates that test normalized file paths.
 */
const normalizeStringLoaderMatchers = (matchers) => {
  const matcherList = Array.isArray(matchers) ? matchers : [matchers];

  return matcherList.filter(Boolean).map((matcher) => {
    if (typeof matcher === "function") {
      return matcher;
    }

    if (matcher instanceof RegExp) {
      return (id) => {
        matcher.lastIndex = 0;
        return matcher.test(id);
      };
    }

    if (typeof matcher !== "string") {
      throw new TypeError("stringLoader matchers must be strings, RegExp values, or functions.");
    }

    if (!matcher.includes("*")) {
      return (id) => id.endsWith(matcher);
    }

    const pattern = matcher.replaceAll("\\", "/");
    return (id) => path.posix.matchesGlob(id, pattern);
  });
};

/**
 * Rollup plugin to import text assets as JS strings.
 *
 * @param {StringLoaderOptions} [options] - Include and exclude matchers for text assets.
 * @returns {import("rollup").Plugin} Rollup plugin that exports matched files as strings.
 */
const stringLoader = ({ exclude = [], include = [] } = {}) => {
  const includeMatchers = normalizeStringLoaderMatchers(include);
  const excludeMatchers = normalizeStringLoaderMatchers(exclude);

  return {
    name: "string-loader",
    transform(code, id) {
      const cleanId = id.split("?", 1)[0].replaceAll("\\", "/");

      if (!includeMatchers.some((matches) => matches(cleanId))) {
        return null;
      }

      if (excludeMatchers.some((matches) => matches(cleanId))) {
        return null;
      }

      return {
        code: `export default ${JSON.stringify(code)};`,
        map: { mappings: "" },
      };
    },
  };
};

export default {
  input: "src/index.js",
  output: {
    banner: `${metadata.trim()}\n`,
    file: "dist/privacy-guard.user.js",
    format: "iife",
    name: "PrivacyGuard",
    strict: false,
  },
  plugins: [stringLoader({ include: ["**/*.html", "**/*.css"] })],
  treeshake: true,
};
