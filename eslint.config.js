// @ts-check

import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import css from "@eslint/css";
import eslint from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import html from "@html-eslint/eslint-plugin";
import * as htmlParser from "@html-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { importX } from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import jestDom from "eslint-plugin-jest-dom";
import jestExtended from "eslint-plugin-jest-extended";
import jsdocPlugin from "eslint-plugin-jsdoc";
import nodePlugin from "eslint-plugin-n";
import nounsanitized from "eslint-plugin-no-unsanitized";
import * as perfectionist from "eslint-plugin-perfectionist";
import promise from "eslint-plugin-promise";
import * as regexpPlugin from "eslint-plugin-regexp";
import security from "eslint-plugin-security";
import * as sonarjs from "eslint-plugin-sonarjs";
import testingLibrary from "eslint-plugin-testing-library";
import unicornPlugin from "eslint-plugin-unicorn";
import yml from "eslint-plugin-yml";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import * as yamlParser from "yaml-eslint-parser";

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

  {
    name: "ESLint core (JS/TS)",
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    plugins: { html },
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      regexpPlugin.configs["flat/recommended"],
      sonarjs.configs.recommended,
      unicornPlugin.configs.recommended,
      perfectionist.configs["recommended-alphabetical"],
      nodePlugin.configs["flat/recommended-module"],
    ],
    languageOptions: {
      ecmaVersion: "latest",
      globals: { ...globals.browser, ...globals.es2025, ...globals.node, ...globals.greasemonkey },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      sourceType: "module",
    },
    rules: {
      "n/no-extraneous-import": ["error", { allowModules: ["vscode"] }],
      "n/no-missing-import": [
        "error",
        {
          allowModules: ["vscode"],
          resolvePaths: ["node_modules/@types"],
          tryExtensions: [".ts", ".d.ts", ".js", ".json", ".node"],
        },
      ],
      "n/no-unpublished-import": "off",
      "n/no-unsupported-features/node-builtins": "off",
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            camelCase: true,
            kebabCase: true,
            pascalCase: true,
          },
        },
      ],
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": "off",
    },
  },

  jsdocPlugin.configs["flat/recommended-mixed"],
  security.configs.recommended,
  importX.flatConfigs.recommended,
  nounsanitized.configs.recommended,
  promise.configs["flat/recommended"],
  comments.recommended,

  {
    name: "JSDoc style handled by Prettier",
    files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    rules: {
      "jsdoc/tag-lines": [
        "error",
        "never",
        { endLines: 0, startLines: 1, tags: { typedef: { lines: "any" } } },
      ],
    },
  },

  // CommonJS
  {
    name: "CommonJS",
    files: ["**/*.{cjs,cts}"],
    extends: [nodePlugin.configs["flat/recommended-script"]],
  },

  // Jest
  {
    name: "Tests",
    files: ["**/*.{test,__tests__,spec}.{js,jsx,cjs,mjs,ts,tsx,cts,mts}", "**/jest.setup.js"],
    extends: [
      jest.configs["flat/recommended"],
      jest.configs["flat/style"],
      jestDom.configs["flat/recommended"],
      jestExtended.configs["flat/all"],
      testingLibrary.configs["flat/dom"],
    ],
    languageOptions: {
      globals: { ...globals.jest },
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
    rules: {
      "no-irregular-whitespace": "off",
    },
  },

  // JSON5
  {
    name: "JSON5",
    files: ["**/*.json5"],
    plugins: { json },
    extends: ["json/recommended"],
    language: "json/json5",
    rules: {
      "no-irregular-whitespace": "off",
    },
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
    },
  },

  // CSS
  {
    name: "CSS",
    files: ["**/*.css"],
    plugins: { css },
    extends: ["css/recommended"],
    language: "css/css",
    rules: {
      "css/use-baseline": ["error", { available: "newly" }],
      "no-irregular-whitespace": "off",
    },
  },

  // HTML
  {
    name: "HTML",
    files: ["**/*.html"],
    plugins: { html },
    extends: ["html/recommended"],
    language: "html/html",
    languageOptions: {
      parser: htmlParser,
      // This tells the parser to treat {{ ... }} as template syntax,
      // so it won't try to parse contents inside as regular HTML
      templateEngineSyntax: {
        "{{": "}}",
      },
    },
    rules: {
      "html/attrs-newline": "off",
      // Disable all formatting rules - let Prettier handle formatting
      "html/indent": "off",
      "html/no-extra-spacing-attrs": "off",
      // Always require self-closing tags for void elements
      "html/require-closing-tags": ["error", { selfClosing: "always" }],
      // Disable doctype rule for HTML fragments (like injected panels)
      "html/require-doctype": "off",
      "no-irregular-whitespace": "off",
    },
  },

  // Prettier
  eslintConfigPrettier,

  {
    name: "Perfectionist override for ESLint config",
    files: ["eslint.config.js"],
    rules: {
      "perfectionist/sort-objects": [
        "error",
        {
          customGroups: [
            { elementNamePattern: "^name$", groupName: "name", selector: "property" },
            { elementNamePattern: "^files$", groupName: "files", selector: "property" },
            { elementNamePattern: "^ignores$", groupName: "ignores", selector: "property" },
            { elementNamePattern: "^plugins$", groupName: "plugins", selector: "property" },
            { elementNamePattern: "^extends$", groupName: "extends", selector: "property" },
            { elementNamePattern: "^language$", groupName: "language", selector: "property" },
            {
              elementNamePattern: "^languageOptions$",
              groupName: "languageOptions",
              selector: "property",
            },
            { elementNamePattern: "^rules$", groupName: "rules", selector: "property" },
          ],
          groups: [
            "name",
            "files",
            "ignores",
            "plugins",
            "extends",
            "language",
            "languageOptions",
            "rules",
            "unknown",
          ],
          order: "asc",
          type: "alphabetical",
        },
      ],
    },
  },
]);
