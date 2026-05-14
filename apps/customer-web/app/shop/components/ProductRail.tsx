"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecommendationProduct } from "../lib/shopConfig";
import { ProductCard } from "./ProductCard";

export function ProductRail({
  products,
  sessionId,
  loading,
  onAdd,
  onOpen
}: {
  products: RecommendationProduct[];
  sessionId: string | null;
  loading: boolean;
  onAdd: (barcode: string, qty: number) => void;
  onOpen: (p: RecommendationProduct) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateArrows());
    ro.observe(el);
    return () => ro.disconnect();
  }, [products, updateArrows]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.min(320, el.clientWidth * 0.85);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
    window.setTimeout(updateArrows, 280);
  }

  return (
    <div className="productRailWrap">
      <button
        type="button"
        className="productRailArrow productRailArrow--left"
        aria-label="Scroll trending left"
        disabled={!canLeft}
        onClick={() => scrollByDir(-1)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div ref={scrollerRef} className="productRail" onScroll={updateArrows}>
        {products.map((p) => (
          <div key={p.id} className="productRail__cell">
            <ProductCard
              product={p}
              disabled={!sessionId || loading}
              loading={loading}
              onAdd={onAdd}
              onOpen={onOpen}
            />
          </div>
        ))}
        <Link href="/shop/search" className="productRail__viewAll">
          <span className="productRail__viewAllInner">
            <span className="productRail__viewAllTitle">View all</span>
            <span className="productRail__viewAllSub">Browse every product</span>
            <span className="productRail__viewAllArrow" aria-hidden>
              →
            </span>
          </span>
        </Link>
      </div>
      <button
        type="button"
        className="productRailArrow productRailArrow--right"
        aria-label="Scroll trending right"
        disabled={!canRight}
        onClick={() => scrollByDir(1)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
