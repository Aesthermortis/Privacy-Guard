// @ts-check

/** @type {import("stylelint").Config} */
const config = {
  extends: ["stylelint-config-standard", "stylelint-config-clean-order"],
  ignoreFiles: ["coverage/**", "dist/**", "build/**"],
  plugins: ["stylelint-order", "stylelint-declaration-strict-value"],
  rules: {
    "declaration-no-important": true,
    "declaration-property-value-disallowed-list": {
      "z-index": [String.raw`/\d{4,}/`],
    },
    "max-nesting-depth": 3,
    "scale-unlimited/declaration-strict-value": [
      ["/color/", "font-size", "z-index", "margin", "padding", "gap", "border-radius"],
      {
        ignoreValues: ["inherit", "transparent", "currentColor", "0", String.raw`/^calc\(.+\)$/`],
      },
    ],
    "selector-class-pattern": [
      "^([a-z][a-z0-9]*)(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$",
      {
        message: "Selector should be in BEM format (e.g., block__element--modifier)",
        resolveNestedSelectors: true,
      },
    ],
    "selector-max-id": 0,
    "selector-max-specificity": "0,3,0",
    "selector-max-type": 2,
  },
};

export default config;
