import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compiler: {
    // 🔥 This removes all console.logs in Production, but keeps them when running locally (npm run dev)
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default nextConfig;