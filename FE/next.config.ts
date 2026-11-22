import type { NextConfig } from "next";

const devHost = process.env.HUDDILO_DEV_HOST;

const nextConfig: NextConfig = {
  ...(devHost ? { allowedDevOrigins: [devHost] } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
