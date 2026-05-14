"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBrowseSuggestions, fetchPopularProducts } from "../../../lib/supabase/catalog";
import { ProductPreviewModal } from "../components/ProductPreviewModal";
import { useShop, type RecommendationProduct } from "../context/ShopContext";
import { productPlaceholderDataUri } from "../lib/productPlaceholder";
import { resolveProductImageUrl } from "../../../lib/productImage";

const SUGGEST_DEBOUNCE_MS = 240;

export default function SearchPage() {
  const router = useRouter();
  const { hydrated, sessionId, loading, message, setMessage, addToCart } = useShop();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<RecommendationProduct[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [preview, setPreview] = useState<RecommendationProduct | null>(null);
  const [popular, setPopular] = useState<RecommendationProduct[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionId) router.replace("/shop");
  }, [hydrated, sessionId, router]);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    let cancelled = false;
    void (async () => {
      setPopularLoading(true);
      const items = await fetchPopularProducts(5);
      if (!cancelled) {
        setPopular(items);
        setPopularLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionId]);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    const term = q.trim();
    if (!term) {
      setSuggestions([]);
      setSuggestLoading(false);
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    setSuggestLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const data = await fetchBrowseSuggestions(term, 12);
        if (!cancelled) {
          setSuggestions(data);
          setSuggestLoading(false);
          setActiveIndex(-1);
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, hydrated, sessionId]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const pickProduct = useCallback((p: RecommendationProduct) => {
    setPreview(p);
    setSuggestOpen(false);
    setActiveIndex(-1);
  }, []);

  async function handleAdd(barcode: string, qty: number) {
    const ok = await addToCart(barcode, qty);
    if (ok) setMessage("Updated bag");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestOpen || suggestions.length === 0) {
      if (e.key === "Escape") setSuggestOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      pickProduct(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  }

  if (!hydrated || !sessionId) {
    return (
      <main className="pageCanvas">
        <div className="skeletonLine skeletonLine--wide" style={{ marginTop: 24 }} />
      </main>
    );
  }

  const trimmed = q.trim();
  const showPanel = suggestOpen && trimmed.length > 0;

  return (
    <>
      <main className="pageCanvas pageCanvas--browse">
        <p className="browseIntro">
          Search by product name, category, or barcode. Pick a match to view details and add to your bag.
        </p>

        <div className="searchWrap" ref={wrapRef}>
          <div className="searchField">
            <span className="searchField__icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
                <path d="M20 20l-4.2-4.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
            <input
              ref={inputRef}
              className="searchField__input"
              placeholder="Type to search…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-expanded={showPanel}
              aria-controls="browse-suggest-list"
              aria-activedescendant={activeIndex >= 0 ? `browse-suggest-${activeIndex}` : undefined}
              autoFocus
            />
            {suggestLoading ? <span className="searchField__spinner" aria-hidden /> : null}
          </div>

          {showPanel ? (
            <div className="searchSuggest" id="browse-suggest-list" role="listbox" aria-label="Product suggestions">
              {suggestions.length === 0 && !suggestLoading ? (
                <p className="searchSuggest__empty">No products match that — try another spelling or barcode.</p>
              ) : (
                <ul className="searchSuggest__list" role="none">
                  {suggestions.map((p, idx) => (
                    <li key={p.id} role="none">
                      <button
                        type="button"
                        id={`browse-suggest-${idx}`}
                        role="option"
                        aria-selected={idx === activeIndex}
                        className={`searchSuggest__row${idx === activeIndex ? " searchSuggest__row--active" : ""}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => pickProduct(p)}
                      >
                        <span className="searchSuggest__name">{p.name}</span>
                        {p.category ? <span className="searchSuggest__meta">{p.category}</span> : null}
                        <span className="searchSuggest__price">₹{p.unitPrice}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {!trimmed ? (
          <section className="browsePopular" aria-label="Popular products">
            <h3 className="browsePopular__title">Popular right now</h3>
            {popularLoading ? (
              <p className="browsePopular__loading">Loading picks…</p>
            ) : popular.length === 0 ? (
              <p className="browsePopular__empty">Start typing above to find products.</p>
            ) : (
              <ul className="browsePopular__list">
                {popular.map((p) => {
                  const imageSrc = resolveProductImageUrl(p.imageUrl);
                  return (
                    <li key={p.id}>
                      <button type="button" className="browsePopular__row" onClick={() => pickProduct(p)}>
                        <span className="browsePopular__thumb" aria-hidden>
                          {imageSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageSrc} alt="" className="browsePopular__img" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={productPlaceholderDataUri(p)} alt="" className="browsePopular__img browsePopular__img--ph" />
                          )}
                        </span>
                        <span className="browsePopular__body">
                          <span className="browsePopular__name">{p.name}</span>
                          {p.category ? <span className="browsePopular__meta">{p.category}</span> : null}
                        </span>
                        <span className="browsePopular__price">₹{p.unitPrice}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {message ? <div className="toast">{message}</div> : null}
      </main>

      <ProductPreviewModal
        product={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        disabled={loading}
        loading={loading}
        onAdd={(bc, qty) => void handleAdd(bc, qty)}
      />
    </>
  );
}
