import { apiBase } from "./apiBase";

/** Map stored image URLs to the live API origin (Vercel /checkout-api proxy or local API). */
export function resolveProductImageUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl?.trim()) return undefined;
  const raw = imageUrl.trim();

  if (raw.startsWith("/checkout-api/") || raw.startsWith(`${apiBase}/`)) {
    return raw;
  }

  if (raw.startsWith("/uploads/")) {
    return `${apiBase}${raw}`;
  }

  try {
    const parsed = new URL(raw);
    const idx = parsed.pathname.indexOf("/uploads/");
    if (idx !== -1) {
      return `${apiBase}${parsed.pathname.slice(idx)}`;
    }
  } catch {
    if (/\.(jpe?g|png|webp|gif)$/i.test(raw) && !raw.includes("/")) {
      return `${apiBase}/uploads/products/${raw}`;
    }
  }

  return raw;
}
