import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@notrix/core-engine", "@notrix/editor"],
};

export default nextConfig;
