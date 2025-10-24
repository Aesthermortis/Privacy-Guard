declare module "eslint-plugin-jest-extended" {
  import type { Linter } from "eslint";

  const jestExtended: {
    configs: {
      "flat/all": Linter.FlatConfig;
    };
  };
  export = jestExtended;
}
