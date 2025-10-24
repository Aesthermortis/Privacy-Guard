declare module "eslint-plugin-no-unsanitized" {
  import type { Linter } from "eslint";

  const nounsanitized: {
    configs: {
      recommended: Linter.Config;
    };
  };
  export = nounsanitized;
}
