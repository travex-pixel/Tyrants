import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
