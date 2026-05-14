const STORAGE_KEY = "checkout_admin_token";
const ROLE_KEY = "checkout_admin_role";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function getAdminRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_KEY);
}

export function setAdminSession(token: string, role: string): void {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}

/** @deprecated Prefer setAdminSession — defaults role to staff */
export function setAdminToken(token: string): void {
  setAdminSession(token, "staff");
}

export function clearAdminToken(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function adminFetchHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const t = getAdminToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}
