import type { NextConfig } from "next";

const apiProxy = process.env.API_PROXY_TARGET?.replace(/\/$/, "");
const basePath = process.env.NEXT_BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  async rewrites() {
    if (!apiProxy) return [];
    return [{ source: "/checkout-api/:path*", destination: `${apiProxy}/:path*` }];
  }
};

export default nextConfig;
