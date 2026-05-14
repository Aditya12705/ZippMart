const PALETTES = [
  { bg: "#e8f4fc", accent: "#1d6fd4", mint: "#34d399", label: "Fresh" },
  { bg: "#ecfdf5", accent: "#059669", mint: "#6ee7b7", label: "Green" },
  { bg: "#f0f9ff", accent: "#0284c7", mint: "#22d3ee", label: "Cool" },
  { bg: "#f8fafc", accent: "#2563eb", mint: "#4ade80", label: "Zip" }
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function paletteFor(product: { name?: string; category?: string; barcode?: string }) {
  const key = `${product.category ?? ""}|${product.name ?? ""}|${product.barcode ?? ""}`;
  return PALETTES[hash(key) % PALETTES.length];
}

function iconPaths(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("beverage") || c.includes("dairy")) {
    return `<rect x="62" y="44" width="36" height="72" rx="10" fill="currentColor" opacity=".9"/>
      <rect x="68" y="36" width="24" height="14" rx="6" fill="currentColor"/>
      <ellipse cx="80" cy="92" rx="14" ry="6" fill="white" opacity=".35"/>`;
  }
  if (c.includes("produce") || c.includes("grocery")) {
    return `<circle cx="58" cy="78" r="22" fill="currentColor" opacity=".85"/>
      <circle cx="88" cy="70" r="18" fill="currentColor" opacity=".65"/>
      <path d="M70 52 Q80 34 92 48" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  if (c.includes("snack") || c.includes("bakery")) {
    return `<rect x="48" y="58" width="64" height="44" rx="12" fill="currentColor" opacity=".88"/>
      <circle cx="64" cy="72" r="5" fill="white" opacity=".45"/>
      <circle cx="80" cy="68" r="5" fill="white" opacity=".45"/>
      <circle cx="96" cy="76" r="5" fill="white" opacity=".45"/>`;
  }
  if (c.includes("personal") || c.includes("household")) {
    return `<rect x="54" y="48" width="52" height="68" rx="14" fill="currentColor" opacity=".9"/>
      <rect x="66" y="40" width="28" height="12" rx="6" fill="currentColor"/>
      <circle cx="80" cy="82" r="10" fill="white" opacity=".3"/>`;
  }
  return `<path d="M44 92 L80 44 L116 92 Z" fill="currentColor" opacity=".82"/>
    <rect x="56" y="92" width="48" height="10" rx="4" fill="currentColor"/>
    <circle cx="80" cy="68" r="8" fill="white" opacity=".35"/>`;
}

export function productPlaceholderDataUri(product: {
  name?: string;
  category?: string;
  barcode?: string;
}): string {
  const { bg, accent, mint, label } = paletteFor(product);
  const cat = product.category?.trim() || "General";
  const short = (product.name?.trim() || cat).slice(0, 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="#ffffff"/>
      </linearGradient>
      <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.2" fill="${mint}" opacity=".35"/>
      </pattern>
    </defs>
    <rect width="160" height="160" fill="url(#g)"/>
    <rect width="160" height="160" fill="url(#dots)"/>
    <circle cx="132" cy="28" r="18" fill="${mint}" opacity=".45"/>
    <circle cx="24" cy="128" r="12" fill="${accent}" opacity=".18"/>
    <g color="${accent}">${iconPaths(cat)}</g>
    <text x="80" y="138" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="${accent}" opacity=".75">${label}</text>
    <text x="80" y="150" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="600" fill="#64748b">${short.replace(/[<>&]/g, "")}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
