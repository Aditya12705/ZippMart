import type { NextConfig } from "next";

const apiProxy = process.env.API_PROXY_TARGET?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiProxy) return [];
    return [{ source: "/checkout-api/:path*", destination: `${apiProxy}/:path*` }];
  }
};

export default nextConfig;
