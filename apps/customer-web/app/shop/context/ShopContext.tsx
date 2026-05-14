"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { fetchCatalogUnified } from "../../../lib/supabase/catalog";
import { resolveProductImageUrl } from "../../../lib/productImage";
import { clearCartBackup, loadCartBackup, saveCartBackup } from "../../../lib/cartBackup";
import {
  clearOfflineQueue,
  enqueueOfflineAdd,
  readOfflineQueue
} from "../../../lib/offlineCartQueue";
import { apiBase, type RecommendationProduct } from "../lib/shopConfig";

export { apiBase, type RecommendationProduct } from "../lib/shopConfig";
const SESSION_STORAGE_KEY = "zippmart-shop-session-id";

export type CartLine = {
  productId?: string;
  barcode?: string;
  name: string;
  qty: number;
  unitPrice?: number;
  taxPercent?: number;
  lineTotal: number;
};

type CartState = {
  items: CartLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
};

type ShopContextValue = {
  hydrated: boolean;
  sessionBootstrapDone: boolean;
  sessionId: string | null;
  loading: boolean;
  message: string;
  setMessage: (m: string) => void;
  cart: CartState;
  cartItemCount: number;
  refreshCart: () => Promise<void>;
  createSession: (storeCode?: string, customerPhone?: string) => Promise<string | null>;
  restoreCartFromBackup: () => Promise<boolean>;
  addByBarcode: (barcode: string) => Promise<boolean>;
  addToCart: (barcode: string, quantity: number, opts?: { skipOfflineQueue?: boolean }) => Promise<boolean>;
  setLineQuantity: (productId: string, quantity: number) => Promise<boolean>;
  checkout: (
    paymentMode: "ONLINE" | "COUNTER",
    receipt?: { receiptEmail?: string; receiptPhone?: string }
  ) => Promise<CheckoutResult | null>;
  clearSession: () => void;
  recoverSessionByPhone: (phone: string) => Promise<boolean>;
};

export type CheckoutResult = {
  orderId: string;
  status: string;
  tokenNumber?: number;
  razorpayOrderId?: string;
};

const defaultCart: CartState = {
  items: [],
  subtotal: 0,
  taxTotal: 0,
  grandTotal: 0
};

const ShopContext = createContext<ShopContextValue | null>(null);

function storeCodeFromUrl(): string {
  if (typeof window === "undefined") return "BLR001";
  const fromUrl = new URLSearchParams(window.location.search).get("store")?.trim();
  return fromUrl ? fromUrl.toUpperCase() : "BLR001";
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [sessionBootstrapDone, setSessionBootstrapDone] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cart, setCart] = useState<CartState>(defaultCart);
  const autoSessionStarted = useRef(false);

  const refreshCart = useCallback(async () => {
    const id = sessionId;
    if (!id) {
      setCart(defaultCart);
      return;
    }
    try {
      const resp = await fetch(`${apiBase}/v1/customer/cart/${id}`);
      if (!resp.ok) {
        setCart(defaultCart);
        return;
      }
      const data = (await resp.json()) as CartState & { items: CartLine[] };
      const items = data.items ?? [];
      setCart({
        items,
        subtotal: Number(data.subtotal ?? 0),
        taxTotal: Number(data.taxTotal ?? 0),
        grandTotal: Number(data.grandTotal ?? 0)
      });
      saveCartBackup(
        items
          .filter((x) => x.barcode?.trim())
          .map((x) => ({ barcode: String(x.barcode).trim(), qty: x.qty, name: x.name }))
      );
    } catch {
      setCart(defaultCart);
    }
  }, [sessionId]);

  /** Validate saved session against API (clears stale IDs after server restart). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    void (async () => {
      try {
        if (saved) {
          const resp = await fetch(`${apiBase}/v1/customer/cart/${saved}`);
          if (cancelled) return;
          if (resp.status === 404) {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            setSessionId(null);
            autoSessionStarted.current = false;
            setSessionBootstrapDone(false);
          } else if (resp.ok) {
            setSessionId(saved);
          }
        }
      } catch {
        if (!cancelled) {
          setMessage(`Cannot reach the checkout API at ${apiBase}. Start it with npm run dev from the project root.`);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const createSession = useCallback(async (storeCode = "BLR001", customerPhone?: string): Promise<string | null> => {
    setLoading(true);
    try {
      const fromStorage =
        typeof window !== "undefined"
          ? localStorage.getItem("zippmart-visit-phone")?.trim() ??
            localStorage.getItem("supermart-visit-phone")?.trim() ??
            ""
          : "";
      const phone = (customerPhone ?? fromStorage).trim();
      const resp = await fetch(`${apiBase}/v1/customer/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeCode,
          ...(phone.length >= 10 ? { customerPhone: phone } : {})
        })
      });
      let data: { sessionId?: string; message?: string } = {};
      try {
        data = await resp.json();
      } catch {
        setMessage("Server returned an invalid response. Is the API running?");
        return null;
      }
      if (!resp.ok) {
        setMessage(
          typeof data === "object" && data && "message" in data && data.message
            ? String(data.message)
            : "Could not start session"
        );
        return null;
      }
      const id = data.sessionId;
      if (!id) {
        setMessage("No session ID from server");
        return null;
      }
      setSessionId(id);
      localStorage.setItem(SESSION_STORAGE_KEY, id);
      setMessage("");
      return id;
    } catch (err) {
      const hint =
        err instanceof TypeError && err.message === "Failed to fetch"
          ? `Cannot reach the checkout API at ${apiBase}. Run: npm run dev:api`
          : `Connection error (${err instanceof Error ? err.message : "unknown"}). Check ${apiBase}`;
      setMessage(hint);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (sessionId) {
      setSessionBootstrapDone(true);
      return;
    }
    if (autoSessionStarted.current) return;
    autoSessionStarted.current = true;
    const code = storeCodeFromUrl();
    void (async () => {
      try {
        await createSession(code);
      } finally {
        setSessionBootstrapDone(true);
      }
    })();
  }, [hydrated, sessionId, createSession]);

  const checkout = useCallback(
    async (
      paymentMode: "ONLINE" | "COUNTER",
      receipt?: { receiptEmail?: string; receiptPhone?: string }
    ) => {
      if (!sessionId) {
        setMessage("No active session");
        return null;
      }
      setLoading(true);
      try {
        const body: Record<string, unknown> = { sessionId, paymentMode };
        const em = receipt?.receiptEmail?.trim();
        const ph = receipt?.receiptPhone?.trim();
        if (em) body.receiptEmail = em;
        if (ph) body.receiptPhone = ph;
        const resp = await fetch(`${apiBase}/v1/customer/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        let data: Record<string, unknown> = {};
        try {
          data = (await resp.json()) as Record<string, unknown>;
        } catch {
          setMessage("Invalid checkout response from server");
          return null;
        }
        if (!resp.ok) {
          const flat = data as { message?: string; fieldErrors?: Record<string, string[]> };
          const fieldMsg = flat.fieldErrors
            ? Object.values(flat.fieldErrors).flat().filter(Boolean).join(" ")
            : "";
          setMessage(flat.message ?? (fieldMsg || "Checkout failed — check receipt details or try again."));
          return null;
        }
        const result: CheckoutResult = {
          orderId: data.orderId as string,
          status: data.status as string,
          tokenNumber: data.tokenNumber as number | undefined,
          razorpayOrderId: data.razorpayOrderId as string | undefined
        };
        if (paymentMode === "COUNTER") {
          setMessage(`Counter token #${data.tokenNumber}. Pay at the desk.`);
        } else {
          setMessage(`Order ready. Complete payment (Razorpay).`);
        }
        return result;
      } catch {
        setMessage(`Cannot reach API at ${apiBase}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sessionId]
  );

  const addToCart = useCallback(
    async (barcode: string, quantity: number, opts?: { skipOfflineQueue?: boolean }) => {
      const qty = Math.min(99, Math.max(1, Math.floor(quantity)));
      let activeId = sessionId;
      if (!activeId) {
        setMessage("Connecting to store… try again in a moment.");
        return false;
      }

      if (!opts?.skipOfflineQueue && typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueOfflineAdd(barcode, qty);
        setMessage("Offline — item saved. It will be added when you are back online.");
        return true;
      }

      const postCart = (sid: string) =>
        fetch(`${apiBase}/v1/customer/cart/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, barcode, quantity: qty })
        });

      setLoading(true);
      try {
        let resp = await postCart(activeId);
        let data: Record<string, unknown> = {};
        try {
          data = (await resp.json()) as Record<string, unknown>;
        } catch {
          setMessage("Invalid response while adding item");
          return false;
        }

        if (resp.status === 404 && String(data.message) === "Session not found") {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionId(null);
          const newId = await createSession(storeCodeFromUrl());
          if (!newId) {
            setMessage("Reconnected to the store — try adding again.");
            return false;
          }
          activeId = newId;
          resp = await postCart(activeId);
          try {
            data = (await resp.json()) as Record<string, unknown>;
          } catch {
            setMessage("Invalid response while adding item");
            return false;
          }
        }

        if (!resp.ok) {
          const raw = (data.message as string) ?? "Could not add item";
          let msg = raw;
          if (raw === "Product not found") {
            msg = "This item is not on the store register yet — try another barcode or ask staff.";
          } else if (raw === "Session not found") {
            msg = "Could not restore your visit. Refresh the page once.";
          }
          setMessage(msg);
          return false;
        }
        const items = (data.items as CartLine[]) ?? [];
        setCart({
          items,
          subtotal: Number(data.subtotal ?? 0),
          taxTotal: Number(data.taxTotal ?? 0),
          grandTotal: Number(data.grandTotal ?? 0)
        });
        saveCartBackup(
          items
            .filter((x) => x.barcode?.trim())
            .map((x) => ({ barcode: String(x.barcode).trim(), qty: x.qty, name: x.name }))
        );
        setMessage(qty > 1 ? `Added ${qty} to cart` : "Added to cart");
        return true;
      } catch {
        setMessage(`Cannot reach API at ${apiBase}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [sessionId, createSession]
  );

  const addByBarcode = useCallback(async (barcode: string) => addToCart(barcode, 1), [addToCart]);

  const setLineQuantity = useCallback(
    async (productId: string, quantity: number) => {
      const qty = Math.min(99, Math.max(0, Math.floor(quantity)));
      if (!sessionId) {
        setMessage("No active session");
        return false;
      }
      setLoading(true);
      try {
        const resp = await fetch(`${apiBase}/v1/customer/cart/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, productId, quantity: qty })
        });
        let data: Record<string, unknown> = {};
        try {
          data = (await resp.json()) as Record<string, unknown>;
        } catch {
          setMessage("Invalid response while updating bag");
          return false;
        }
        if (!resp.ok) {
          setMessage((data.message as string) ?? "Could not update quantity");
          return false;
        }
        setCart({
          items: (data.items as CartLine[]) ?? [],
          subtotal: Number(data.subtotal ?? 0),
          taxTotal: Number(data.taxTotal ?? 0),
          grandTotal: Number(data.grandTotal ?? 0)
        });
        const items = (data.items as CartLine[]) ?? [];
        saveCartBackup(
          items
            .filter((x) => x.barcode?.trim())
            .map((x) => ({ barcode: String(x.barcode).trim(), qty: x.qty, name: x.name }))
        );
        setMessage(qty === 0 ? "Removed from bag" : "Bag updated");
        return true;
      } catch {
        setMessage(`Cannot reach API at ${apiBase}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [sessionId]
  );

  const clearSession = useCallback(() => {
    autoSessionStarted.current = false;
    setSessionBootstrapDone(false);
    setSessionId(null);
    setCart(defaultCart);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    clearCartBackup();
    clearOfflineQueue();
  }, []);

  const restoreCartFromBackup = useCallback(async () => {
    if (!sessionId) {
      setMessage("Connect to the store first.");
      return false;
    }
    const b = loadCartBackup();
    if (!b?.items.length) {
      setMessage("No saved bag found on this device.");
      return false;
    }
    setLoading(true);
    try {
      for (const row of b.items) {
        const ok = await addToCart(row.barcode, row.qty, { skipOfflineQueue: true });
        if (!ok) {
          setMessage("Stopped part-way — check connection or stock.");
          return false;
        }
      }
      setMessage("Restored your last saved bag.");
      await refreshCart();
      return true;
    } finally {
      setLoading(false);
    }
  }, [sessionId, addToCart, refreshCart]);

  const recoverSessionByPhone = useCallback(
    async (phone: string) => {
      const t = phone.trim().replace(/\s/g, "");
      if (t.length < 10) {
        setMessage("Enter at least 10 digits for phone lookup.");
        return false;
      }
      setLoading(true);
      try {
        const resp = await fetch(
          `${apiBase}/v1/customer/session/latest?phone=${encodeURIComponent(t)}`
        );
        const data = (await resp.json()) as { sessionId?: string; message?: string };
        if (!resp.ok || !data.sessionId) {
          setMessage(typeof data.message === "string" ? data.message : "No visit found");
          return false;
        }
        localStorage.setItem("zippmart-visit-phone", t);
        setSessionId(data.sessionId);
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
        setSessionBootstrapDone(true);
        setMessage("Restored your visit on this device.");
        await refreshCart();
        return true;
      } catch {
        setMessage(`Cannot reach API at ${apiBase}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshCart]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onOnline = () => {
      const q = readOfflineQueue();
      if (!q.length) return;
      clearOfflineQueue();
      void (async () => {
        if (!sessionId) return;
        setLoading(true);
        for (const row of q) {
          await addToCart(row.barcode, row.qty, { skipOfflineQueue: true });
        }
        setMessage("Back online — queued items were sent.");
        await refreshCart();
        setLoading(false);
      })();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sessionId, addToCart, refreshCart]);

  const cartItemCount = useMemo(
    () => cart.items.reduce((sum, line) => sum + line.qty, 0),
    [cart.items]
  );

  const value = useMemo<ShopContextValue>(
    () => ({
      hydrated,
      sessionBootstrapDone,
      sessionId,
      loading,
      message,
      setMessage,
      cart,
      cartItemCount,
      refreshCart,
      createSession,
      restoreCartFromBackup,
      recoverSessionByPhone,
      addByBarcode,
      addToCart,
      setLineQuantity,
      checkout,
      clearSession
    }),
    [
      hydrated,
      sessionBootstrapDone,
      sessionId,
      loading,
      message,
      cart,
      cartItemCount,
      refreshCart,
      createSession,
      restoreCartFromBackup,
      recoverSessionByPhone,
      addByBarcode,
      addToCart,
      setLineQuantity,
      checkout,
      clearSession
    ]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}

export async function fetchHighDemand(): Promise<RecommendationProduct[]> {
  try {
    const resp = await fetch(`${apiBase}/v1/customer/recommendations`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const rows = (data.highDemand ?? []) as RecommendationProduct[];
    return rows.map((p) => ({
      ...p,
      imageUrl: p.imageUrl?.trim() ? resolveProductImageUrl(p.imageUrl.trim()) : undefined
    }));
  } catch {
    return [];
  }
}

export async function fetchCatalogSample(): Promise<RecommendationProduct[]> {
  return fetchCatalogUnified();
}
