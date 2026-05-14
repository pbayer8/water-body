import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin workspace root so a parent-directory lockfile does not confuse Turbopack.
  turbopack: {
    root: rootDir,
    resolveAlias: {
      "@mediapipe/selfie_segmentation":
        "./src/shims/mediapipe-selfie-segmentation.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@mediapipe/selfie_segmentation": path.join(
        rootDir,
        "src/shims/mediapipe-selfie-segmentation.ts",
      ),
    };
    return config;
  },
};

export default nextConfig;
