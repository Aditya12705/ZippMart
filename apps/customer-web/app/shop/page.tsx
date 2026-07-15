"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductCard } from "./components/ProductCard";
import { ProductPreviewModal } from "./components/ProductPreviewModal";
import { ProductRail } from "./components/ProductRail";
import {
  apiBase,
  fetchCatalogSample,
  fetchHighDemand,
  useShop,
  type RecommendationProduct
} from "./context/ShopContext";
import { BRAND_NAME } from "./lib/apparel";

export default function ShopHomePage() {
  const {
    sessionId,
    sessionBootstrapDone,
    loading,
    message,
    setMessage,
    createSession,
    addToCart,
    cartItemCount,
    recoverSessionByPhone,
    restoreCartFromBackup,
    cart
  } = useShop();
  const [highDemand, setHighDemand] = useState<RecommendationProduct[]>([]);
  const [catalog, setCatalog] = useState<RecommendationProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogApiDown, setCatalogApiDown] = useState(false);
  const [category, setCategory] = useState("All");
  const [sizeFilter, setSizeFilter] = useState("All");
  const [preview, setPreview] = useState<RecommendationProduct | null>(null);
  const [visitPhone, setVisitPhone] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVisitPhone(localStorage.getItem("proflo-visit-phone") ?? localStorage.getItem("zippmart-visit-phone") ?? localStorage.getItem("supermart-visit-phone") ?? "");
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogApiDown(false);
    try {
      const health = await fetch(`${apiBase}/health`);
      if (!health.ok) {
        setCatalogApiDown(true);
        setHighDemand([]);
        setCatalog([]);
        return;
      }
      const [hd, all] = await Promise.all([fetchHighDemand(), fetchCatalogSample()]);
      setHighDemand(hd);
      setCatalog(all);
      setCatalogApiDown(false);
    } catch {
      setCatalogApiDown(true);
      setHighDemand([]);
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of catalog) {
      if (p.category?.trim()) s.add(p.category.trim());
    }
    return ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [catalog]);

  const sizes = useMemo(() => {
    const s = new Set<string>();
    for (const p of catalog) {
      if (p.size?.trim()) s.add(p.size.trim());
    }
    return ["All", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [catalog]);

  const filtered = useMemo(() => {
    let list = catalog;
    if (category !== "All") {
      list = list.filter((p) => (p.category ?? "").trim() === category);
    }
    if (sizeFilter !== "All") {
      list = list.filter((p) => (p.size ?? "").trim() === sizeFilter);
    }
    return list;
  }, [catalog, category, sizeFilter]);

  async function handleAdd(barcode: string, qty: number) {
    if (!sessionId) {
      setMessage("Still connecting… try again in a moment.");
      return;
    }
    await addToCart(barcode, qty);
  }

  async function retryConnect() {
    setMessage("");
    const store =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("store")?.trim()?.toUpperCase()
        : undefined;
    if (visitPhone.trim().length >= 10) {
      localStorage.setItem("proflo-visit-phone", visitPhone.trim());
    }
    await createSession(store ?? "BLR001", visitPhone.trim().length >= 10 ? visitPhone.trim() : undefined);
  }

  const showConnecting = !sessionId && !sessionBootstrapDone;
  const showConnectionError = sessionBootstrapDone && !sessionId;

  const discountPercent = cart.loyaltyDiscountPercent ?? 0;
  const loyaltyTier =
    discountPercent === 10 ? "Gold" :
    discountPercent === 5 ? "Silver" :
    (visitPhone.trim().length >= 10 ? "Bronze" : null);

  return (
    <>
      <div className="pageCanvas pageCanvas--home">
        <section className="homeTop">
          <div className="heroBlock heroBlock--compact">
            <div className="heroBlock__head">
              <div>
                <p className="heroBlock__eyebrow">{BRAND_NAME} · scan &amp; go</p>
                <h2 className="heroBlock__title">Seam in, style out</h2>
                {loyaltyTier ? (
                  <div className={`loyaltyBadge loyaltyBadge--${loyaltyTier.toLowerCase()}`}>
                    {loyaltyTier} Member ({discountPercent}% Off)
                  </div>
                ) : null}
              </div>
              <div className="heroBlock__status">
                {showConnecting ? (
                  <span className="statusChip statusChip--pending">Connecting…</span>
                ) : sessionId ? (
                  <span className="statusChip statusChip--ok">Ready</span>
                ) : (
                  <span className="statusChip statusChip--warn">Offline</span>
                )}
              </div>
            </div>
            <p className="heroBlock__lede">Beep barcodes, browse the aisles, bounce when you&apos;re done.</p>
          </div>

          <section className="quickLinks quickLinks--home" aria-label="Quick actions">
            {sessionId ? (
              <>
                <Link href="/shop/scan" className="quickLink quickLink--accent">
                  <span className="quickLink__icon" aria-hidden>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5" width="6" height="14" stroke="currentColor" strokeWidth="1.75" rx="1" />
                      <rect x="15" y="5" width="6" height="14" stroke="currentColor" strokeWidth="1.75" rx="1" />
                      <path d="M9 12h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="quickLink__label">Scan barcode</span>
                </Link>
                <Link href="/shop/search" className="quickLink">
                  <span className="quickLink__icon" aria-hidden>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
                      <path d="M20 20l-4.2-4.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="quickLink__label">Search products</span>
                </Link>
              </>
            ) : (
              <>
                <div className="quickLink quickLink--disabled">
                  <span className="quickLink__label">Scan barcode</span>
                  <span className="quickLink__hint">{showConnectionError ? "Connect first" : "Almost there…"}</span>
                </div>
                <div className="quickLink quickLink--disabled">
                  <span className="quickLink__label">Search products</span>
                  <span className="quickLink__hint">{showConnectionError ? "Connect first" : "Almost there…"}</span>
                </div>
              </>
            )}
          </section>
        </section>

        {sessionId && cartItemCount > 0 ? (
          <div className="bagStrip">
            <p className="bagStrip__text">{cartItemCount} item{cartItemCount === 1 ? "" : "s"} in your bag</p>
            <Link href="/shop/cart" className="bagStrip__link">
              Review bag →
            </Link>
            <button type="button" className="bagStrip__link bagStrip__link--btn" disabled={loading} onClick={() => void restoreCartFromBackup()}>
              Restore saved bag
            </button>
          </div>
        ) : null}

        <details className="visitPanel visitPanel--fold">
          <summary className="visitPanel__summary">Optional phone for visit recovery</summary>
          <p className="visitPanel__hint">Saved on this device only — reconnect on the same register if you switch phones.</p>
          <div className="visitPanel__row">
            <input
              className="visitPanel__input"
              type="tel"
              inputMode="tel"
              placeholder="10+ digit mobile"
              value={visitPhone}
              onChange={(e) => setVisitPhone(e.target.value)}
              onBlur={() => {
                if (visitPhone.trim().length >= 10) {
                  localStorage.setItem("proflo-visit-phone", visitPhone.trim());
                }
              }}
            />
            <button
              type="button"
              className="btnGhost"
              disabled={loading || visitPhone.trim().length < 10}
              onClick={() => void recoverSessionByPhone(visitPhone)}
            >
              Find visit
            </button>
          </div>
        </details>

        {showConnecting ? (
          <p className="inlineNotice">Linking to this store…</p>
        ) : showConnectionError ? (
          <div className="panel panel--warn">
            <p className="panel__title">Could not start your visit</p>
            <p className="panel__text">{message || "We could not connect to the store. Check your connection and try again."}</p>
            <button type="button" className="btnPrimary btnPrimary--full" disabled={loading} onClick={() => void retryConnect()}>
              {loading ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : null}

        {catalogApiDown ? (
          <div className="panel panel--warn">
            <p className="panel__title">Store temporarily unavailable</p>
            <p className="panel__text">We could not load products right now. Please try again in a moment.</p>
            <button type="button" className="btnGhost btnGhost--full" disabled={catalogLoading} onClick={() => void loadCatalog()}>
              {catalogLoading ? "Loading…" : "Retry"}
            </button>
          </div>
        ) : null}

        {highDemand.length > 0 ? (
          <section className="railSection">
            <div className="railSection__head">
              <h3 className="railSection__title">Trending now</h3>
              <p className="railSection__sub">Popular picks this hour — use arrows to browse</p>
            </div>
            <ProductRail
              products={highDemand}
              sessionId={sessionId}
              loading={loading}
              onAdd={(bc, q) => void handleAdd(bc, q)}
              onOpen={setPreview}
            />
          </section>
        ) : null}

        {!catalogApiDown ? (
        <section className="catalogSection">
          <div className="catalogSection__head">
            <h3 className="catalogSection__title">Shop by category</h3>
            <p className="catalogSection__sub">{filtered.length} items</p>
          </div>
          <div className="categoryChips" role="tablist" aria-label="Category">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                className={`categoryChip${category === c ? " categoryChip--on" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {sizes.length > 1 ? (
            <div className="categoryChips categoryChips--sub" role="tablist" aria-label="Size">
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={sizeFilter === s}
                  className={`categoryChip${sizeFilter === s ? " categoryChip--on" : ""}`}
                  onClick={() => setSizeFilter(s)}
                >
                  {s === "All" ? "All sizes" : s}
                </button>
              ))}
            </div>
          ) : null}
          {catalogLoading ? (
            <p className="emptyCatalog">Loading products…</p>
          ) : catalog.length === 0 ? (
            <p className="emptyCatalog">Nothing on the shelves yet — scan a barcode or check back soon.</p>
          ) : filtered.length === 0 ? (
            <p className="emptyCatalog">No items in this category.</p>
          ) : (
            <div className="productGrid">
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  disabled={!sessionId || loading}
                  loading={loading}
                  onAdd={(bc, q) => void handleAdd(bc, q)}
                  onOpen={setPreview}
                />
              ))}
            </div>
          )}
        </section>
        ) : null}

        {message && !showConnectionError ? <div className="toast">{message}</div> : null}
      </div>

      <ProductPreviewModal
        product={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        disabled={!sessionId || loading}
        loading={loading}
        onAdd={(bc, q) => {
          void handleAdd(bc, q);
        }}
      />
    </>
  );
}
