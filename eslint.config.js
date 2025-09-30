import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import jest from "eslint-plugin-jest";
import jsdoc from "eslint-plugin-jsdoc";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig([
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "package-lock.json",
    ],
  },

  // lint JavaScript files
  {
    files: ["**/*.{js,jsx,cjs,mjs}"],
    plugins: { jest },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2025,
        ...globals.node,
        ...globals.greasemonkey,
        ...globals.jest,
      },
    },
    ...js.configs.recommended,
    ...jest.configs["flat/recommended"],
  },

  // lint TypeScript files
  {
    files: ["**/*.{ts,tsx,cts,mts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectServices: true },
    },
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
  },

  // lint JSDoc in JS/TS files
  {
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    plugins: {
      jsdoc: jsdoc,
    },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],
      "jsdoc/require-description": "warn",
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns": "error",
      "jsdoc/check-types": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/valid-types": "error",
    },
    settings: {
      jsdoc: {
        mode: "typescript",
        preferredTypes: {
          String: "string",
          Number: "number",
          Boolean: "boolean",
          object: "Object",
        },
      },
    },
  },

  // lint JSON files
  {
    files: ["**/*.json"],
    ignores: ["**/package-lock.json"],
    plugins: { json },
    extends: ["json/recommended"],
    language: "json/json",
    rules: {
      "no-irregular-whitespace": "off",
    },
  },

  // lint JSONC files
  {
    files: ["**/*.jsonc", ".vscode/*.json"],
    plugins: { json },
    language: "json/jsonc",
    rules: {
      "json/no-duplicate-keys": "error",
    },
  },

  // lint Markdown files
  {
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
  // Disable rules that conflict with Prettier
  eslintConfigPrettier,
]);
