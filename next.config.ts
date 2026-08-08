import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compiler: {
    // 🔥 This removes all console.logs in Production, but keeps them when running locally (npm run dev)
    removeConsole: process.env.NODE_ENV === "production",
  },

  // 🚀 Tells Next.js NOT to bundle these packages so Vercel keeps their /bin files intact
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;