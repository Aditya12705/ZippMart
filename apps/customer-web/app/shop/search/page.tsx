"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBrowseSuggestions } from "../../../lib/supabase/catalog";
import { ProductPreviewModal } from "../components/ProductPreviewModal";
import { useShop, type RecommendationProduct } from "../context/ShopContext";

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionId) router.replace("/shop");
  }, [hydrated, sessionId, router]);

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
          Start typing a product name or barcode. We only show a short list of matches from what is available — nothing
          loads until you search.
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
          <p className="browseHint">Your suggestions are pulled from the checkout catalogue and Supabase when configured.</p>
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
