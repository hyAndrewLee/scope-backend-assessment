/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Run lint locally; deployment builds still enforce TypeScript correctness.
  eslint: { ignoreDuringBuilds: true },
};

export default config;
