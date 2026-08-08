import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compiler: {
    // 🔥 This removes all console.logs in Production, but keeps them when running locally (npm run dev)
    removeConsole: process.env.NODE_ENV === "production",
  },

  // 1. Opt out of bundling so package references stay intact
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  // 2. Force Vercel to copy the physical Chromium /bin binary files into your API routes
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;