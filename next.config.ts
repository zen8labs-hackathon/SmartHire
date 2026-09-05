import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
  /**
   * The Web Push service worker must never be served stale -- a cached `sw.js`
   * keeps an old push/notificationclick handler alive across deploys.
   * `Service-Worker-Allowed: /` lets it control the whole origin even though
   * it's served from `/sw.js`.
   */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
