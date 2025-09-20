import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default defineConfig([
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.es2025,
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  eslintPluginPrettierRecommended,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "out/**",
      "scripts/**",
      "README.md",
      "package.json",
      "package-lock.json",
      "*.config.js",
      "*.config.mjs",
    ],
  },
]);
