declare module "eslint-plugin-promise" {
  import type { Linter } from "eslint";

  const promise: {
    configs: {
      recommended: Linter.Config;
      "flat/recommended": Linter.FlatConfig;
    };
  };
  export = promise;
}
