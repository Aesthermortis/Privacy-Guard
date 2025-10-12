import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import * as tseslint from "typescript-eslint";
import pluginJest from "eslint-plugin-jest";
import jestExtended from "eslint-plugin-jest-extended";
import jsdocPlugin from "eslint-plugin-jsdoc";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import { importX } from "eslint-plugin-import-x";
import nodePlugin from "eslint-plugin-n";
import promise from "eslint-plugin-promise";
import * as regexpPlugin from "eslint-plugin-regexp";
import security from "eslint-plugin-security";
import * as sonarjs from "eslint-plugin-sonarjs";
import unicornPlugin from "eslint-plugin-unicorn";
import yml from "eslint-plugin-yml";
import * as yamlParser from "yaml-eslint-parser";
import stylistic from "@stylistic/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";

// Define glob patterns for test files
const testGlobs = ["**/*.{test,spec}.{js,jsx,cjs,mjs,ts,tsx,cts,mts}", "**/jest.setup.js"];

// Base global variables for all environments
const baseGlobals = {
  ...globals.browser,
  ...globals.es2025,
  ...globals.node,
  ...globals.greasemonkey,
};

export default defineConfig([
  {
    name: "Global Ignores",
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".next/**",
      "coverage/**",
      ".github/**",
      ".vscode/**",
      "package-lock.json",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,
  jsdocPlugin.configs["flat/recommended-mixed"],
  comments.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  promise.configs["flat/recommended"],
  security.configs.recommended,

  // Node
  {
    name: "Node",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    extends: [nodePlugin.configs["flat/recommended-module"]],
  },

  // RegExp
  {
    name: "RegExp",
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    extends: [regexpPlugin.configs["flat/recommended"]],
  },

  // Sonarjs
  {
    name: "Sonarjs",
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    extends: [sonarjs.configs["recommended"]],
  },

  // Unicorn
  {
    name: "Unicorn",
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    extends: [unicornPlugin.configs["recommended"]],
  },

  // JavaScript
  {
    name: "JavaScript",
    files: ["**/*.{js,jsx,mjs}"],
    ignores: testGlobs,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...baseGlobals },
    },
  },

  // CommonJS
  {
    name: "CommonJS",
    files: ["**/*.cjs"],
    extends: [nodePlugin.configs["flat/recommended-script"]],
  },

  // Jest
  {
    name: "Tests",
    files: testGlobs,
    extends: [
      pluginJest.configs["flat/recommended"],
      pluginJest.configs["flat/style"],
      jestExtended.configs["flat/all"],
    ],
    languageOptions: {
      globals: { ...baseGlobals },
    },
  },

  // JSON
  {
    name: "JSON",
    files: ["**/*.json"],
    ignores: ["package-lock.json"],
    plugins: { json },
    extends: ["json/recommended"],
    language: "json/json",
    rules: {
      "no-irregular-whitespace": "off",
    },
  },

  // JSONC
  {
    name: "JSONC",
    files: ["**/*.jsonc"],
    plugins: { json },
    extends: ["json/recommended"],
    language: "json/jsonc",
  },

  // JSON5
  {
    name: "JSON5",
    files: ["**/*.json5"],
    plugins: { json },
    extends: ["json/recommended"],
    language: "json/json5",
  },

  // Markdown
  {
    name: "Markdown",
    files: ["**/*.md"],
    plugins: { markdown },
    extends: ["markdown/recommended"],
    language: "markdown/gfm",
    languageOptions: {
      frontmatter: "yaml",
    },
    rules: {
      "no-irregular-whitespace": "off",
    },
  },

  // YAML
  {
    name: "YAML",
    files: ["**/*.{yml,yaml}"],
    extends: [yml.configs["flat/recommended"]],
    languageOptions: {
      parser: yamlParser,
      parserOptions: {
        defaultYAMLVersion: "1.2",
      },
    },
  },

  // Stylistic
  {
    name: "Stylistic",
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    extends: [stylistic.configs.recommended],
  },

  // Prettier
  {
    name: "Prettier",
    ...eslintConfigPrettier,
  },

  // Custom rules
  {
    name: "Custom",
    files: ["**/*"],
    rules: {
      "n/no-extraneous-import": "off",
      "n/no-unpublished-import": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
    },
  },
]);
