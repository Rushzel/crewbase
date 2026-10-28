import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is per-user and per-business, so pages render on request (no component caching).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // The face library's package points bundlers at its Node.js build; it only ever runs in the browser.
    resolveAlias: {
      "@vladmandic/human": "./node_modules/@vladmandic/human/dist/human.esm.js",
    },
  },
};

export default nextConfig;
