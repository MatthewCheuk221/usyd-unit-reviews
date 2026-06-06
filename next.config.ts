import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  // Security headers (CSP, HSTS, etc.) are set dynamically per-request in
  // src/proxy.ts so they can carry a per-request nonce for script-src.
};

export default nextConfig;
