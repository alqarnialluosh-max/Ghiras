import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  serverExternalPackages: ["@node-rs/argon2", "pg"],
};

export default nextConfig;
