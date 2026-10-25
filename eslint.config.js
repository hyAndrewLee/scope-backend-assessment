import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = tseslint.config(
  { ignores: [".next/**", "node_modules/**", ".scratch/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommended,
  {
    rules: {
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
        {
          blankLine: "any",
          prev: ["const", "let", "var"],
          next: ["const", "let", "var"],
        },
        {
          blankLine: "always",
          prev: ["multiline-const", "multiline-let", "multiline-var"],
          next: "*",
        },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "return" },
        {
          blankLine: "always",
          prev: ["function", "class", "export"],
          next: "*",
        },
        {
          blankLine: "always",
          prev: "*",
          next: ["function", "class", "export"],
        },
      ],
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],
    },
  },
);

export default config;
