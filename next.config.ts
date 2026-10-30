import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  logging: { incomingRequests: false },
  allowedDevOrigins: process.env.APP_BASE_URL
    ? [new URL(process.env.APP_BASE_URL).hostname]
    : [],
};
export default nextConfig;
