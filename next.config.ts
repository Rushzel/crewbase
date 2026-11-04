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
  },
  // The face check runs on the server with native packages, and needs its model files deployed with it.
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  outputFileTracingIncludes: { "/api/face/check": ["./models/face/**"] },
  // Leave attachments (up to 5 MB) are uploaded through a server action; the default limit is 1 MB.
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
