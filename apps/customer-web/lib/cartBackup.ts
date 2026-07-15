const KEY = "proflo-cart-backup-v1";

export type CartBackup = {
  savedAt: string;
  items: Array<{ barcode: string; qty: number; name?: string }>;
};

export function saveCartBackup(items: CartBackup["items"]) {
  if (typeof window === "undefined") return;
  if (!items.length) {
    localStorage.removeItem(KEY);
    return;
  }
  const payload: CartBackup = { savedAt: new Date().toISOString(), items };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadCartBackup(): CartBackup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as CartBackup;
    if (!p?.items || !Array.isArray(p.items)) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearCartBackup() {
  localStorage.removeItem(KEY);
}
