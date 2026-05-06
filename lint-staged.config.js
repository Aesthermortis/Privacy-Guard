// @ts-check

/** @type {import("lint-staged").Configuration} */
const config = {
  "**/*": ["prettier --write --ignore-unknown"],
  "**/*.{css,scss}": ["stylelint --fix --allow-empty-input"],
  "**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}": [
    "eslint --fix --max-warnings=0 --report-unused-disable-directives --no-warn-ignored",
  ],
};

export default config;
