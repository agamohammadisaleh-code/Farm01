import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  webpack(config) {
    config.resolve.alias = { ...(config.resolve.alias || {}), "@": root };
    return config;
  },
};

export default nextConfig;
