const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const cashierKey = process.env.NEXT_PUBLIC_CASHIER_API_KEY ?? "";

export function cashierHeaders(json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (cashierKey) h["X-Cashier-Key"] = cashierKey;
  return h;
}

export { apiBase };
