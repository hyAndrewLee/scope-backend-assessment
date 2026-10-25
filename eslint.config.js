import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = tseslint.config(
  { ignores: [".next/**", "node_modules/**", ".scratch/**"] },
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommended,
);
export default config;
