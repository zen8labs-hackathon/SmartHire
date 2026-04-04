import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Ensure PDF evaluation routes can read bundled Noto TTFs on Vercel/serverless. */
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
