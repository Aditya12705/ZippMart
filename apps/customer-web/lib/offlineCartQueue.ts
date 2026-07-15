const QUEUE_KEY = "proflo-offline-cart-queue";
const MAX = 25;

export type QueuedCartAdd = { barcode: string; qty: number; enqueuedAt: string };

export function readOfflineQueue(): QueuedCartAdd[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as QueuedCartAdd[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items: QueuedCartAdd[]) {
  sessionStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX)));
}

export function enqueueOfflineAdd(barcode: string, qty: number) {
  const next = [...readOfflineQueue(), { barcode, qty, enqueuedAt: new Date().toISOString() }];
  writeOfflineQueue(next);
}

export function clearOfflineQueue() {
  sessionStorage.removeItem(QUEUE_KEY);
}
