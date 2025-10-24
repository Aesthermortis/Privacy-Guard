declare module "@eslint-community/eslint-plugin-eslint-comments/configs" {
  import type { Linter } from "eslint";

  const comments: {
    recommended: Linter.Config;
  };
  export = comments;
}
