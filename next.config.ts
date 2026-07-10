import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Ensure PDF evaluation routes can read bundled Noto TTFs on Vercel/serverless. */
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  /**
   * Disable React Strict Mode in development to prevent effects from running
   * twice. Strict Mode's double-invocation breaks the skipInitialFetchRef
   * guard pattern (the ref's value is mutated on the first run, so the
   * simulated remount triggers an unwanted API call). In production, effects
   * only run once, so this only affects the development experience.
   */
  reactStrictMode: false,
};

export default nextConfig;
