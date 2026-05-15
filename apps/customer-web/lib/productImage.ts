import { apiBase } from "./apiBase";

function isSupabaseStorageUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host.endsWith(".supabase.co") || host.endsWith(".supabase.in");
  } catch {
    return false;
  }
}

function isPersistentHttpsUrl(raw: string): boolean {
  return raw.startsWith("https://") && !raw.includes("/uploads/products/");
}

/** Prefer URLs that survive API redeploys (Supabase Storage or other HTTPS). */
export function pickProductImageUrl(
  apiUrl?: string | null,
  dbUrl?: string | null
): string | undefined {
  const a = apiUrl?.trim();
  const b = dbUrl?.trim();
  const candidates = [a, b].filter(Boolean) as string[];

  for (const c of candidates) {
    if (isSupabaseStorageUrl(c) || (isPersistentHttpsUrl(c) && !c.includes("/uploads/"))) {
      return c;
    }
  }
  return a ?? b;
}

/** Map stored image URLs to a browser-loadable origin. */
export function resolveProductImageUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl?.trim()) return undefined;
  const raw = imageUrl.trim();

  if (isSupabaseStorageUrl(raw)) {
    return raw;
  }

  if (raw.startsWith("/checkout-api/") || raw.startsWith(`${apiBase}/`)) {
    return raw;
  }

  if (raw.startsWith("/uploads/")) {
    return `${apiBase}${raw}`;
  }

  try {
    const parsed = new URL(raw);
    if (isSupabaseStorageUrl(raw)) {
      return raw;
    }
    const idx = parsed.pathname.indexOf("/uploads/");
    if (idx !== -1 && !parsed.hostname.includes("supabase")) {
      return `${apiBase}${parsed.pathname.slice(idx)}`;
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return raw;
    }
  } catch {
    if (/\.(jpe?g|png|webp|gif)$/i.test(raw) && !raw.includes("/")) {
      return `${apiBase}/uploads/products/${raw}`;
    }
  }

  return raw;
}
