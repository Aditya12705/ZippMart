/** Browser API origin — use `/checkout-api` on Vercel with API_PROXY_TARGET rewrite. */
export const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
