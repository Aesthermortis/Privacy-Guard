// @ts-check

/** @type {import("prettier").Config} */
const config = {
  arrowParens: "always",
  endOfLine: "lf",
  jsdocDescriptionInTheSameLine: true,
  jsdocGroupColumnsByTag: false,
  jsdocIgnoreTags: ["license"],
  jsdocInlineDescriptionMinLength: 15,
  jsdocMinSpacesBetweenNameAndDescription: 1,
  jsdocPrintWidth: 120,
  jsdocUseColumns: false,
  jsdocUseInlineCommentForASingleTagBlock: true,
  jsdocUseSingleQuotesForStringLiterals: false,
  jsdocUseTypeScriptTypesCasing: false,
  plugins: ["prettier-plugin-packagejson", "@homer0/prettier-plugin-jsdoc"],
  printWidth: 100,
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "all",
};

export default config;
