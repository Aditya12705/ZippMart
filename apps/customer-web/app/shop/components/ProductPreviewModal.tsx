"use client";

import { useEffect, useRef, useState } from "react";
import type { RecommendationProduct } from "../lib/shopConfig";
import { productPlaceholderDataUri } from "../lib/productPlaceholder";
import { resolveProductImageUrl } from "../../../lib/productImage";
import { apiBase } from "../../../lib/apiBase";

export function ProductPreviewModal({
  product,
  open,
  onClose,
  disabled,
  loading,
  onAdd
}: {
  product: RecommendationProduct | null;
  open: boolean;
  onClose: () => void;
  disabled: boolean;
  loading: boolean;
  onAdd: (barcode: string, qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const [imgFailed, setImgFailed] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RecommendationProduct | null>(null);
  const [variants, setVariants] = useState<RecommendationProduct[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setQty(1);
    setImgFailed(false);
    setSelectedProduct(product);

    if (!product) {
      setVariants([]);
      return;
    }

    const styleCode = product.styleCode?.trim();
    if (!styleCode) {
      setVariants([product]);
      return;
    }

    let cancelled = false;
    setVariantsLoading(true);

    void (async () => {
      try {
        const resp = await fetch(`${apiBase}/v1/customer/products?q=${encodeURIComponent(styleCode)}`);
        if (!resp.ok) throw new Error();
        const data = (await resp.json()) as RecommendationProduct[];
        // exact match on styleCode to avoid partial string matches
        const filtered = data.filter((x) => x.styleCode?.trim() === styleCode);
        if (!cancelled) {
          setVariants(filtered.length > 0 ? filtered : [product]);
        }
      } catch {
        if (!cancelled) {
          setVariants([product]);
        }
      } finally {
        if (!cancelled) {
          setVariantsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    if (!open || !product) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, product, onClose]);

  if (!open || !product) return null;

  const activeProduct = selectedProduct ?? product;
  const barcode = activeProduct.barcode?.trim();
  const inStock = activeProduct.inStock ?? 0;
  const isOutOfStock = inStock <= 0;
  const canAct = Boolean(barcode) && !disabled && !isOutOfStock;
  const imageSrc = resolveProductImageUrl(activeProduct.imageUrl);
  const showPlaceholder = !imageSrc || imgFailed;

  const uniqueSizes = Array.from(new Set(variants.map((v) => v.size?.trim()).filter(Boolean))) as string[];
  const uniqueColors = Array.from(new Set(variants.map((v) => v.color?.trim()).filter(Boolean))) as string[];

  const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL", "Free Size"];
  function sortSizes(sizes: string[]): string[] {
    return [...sizes].sort((a, b) => {
      const aIdx = sizeOrder.indexOf(a.toUpperCase());
      const bIdx = sizeOrder.indexOf(b.toUpperCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  const handleSizeSelect = (s: string) => {
    if (!activeProduct) return;
    const match = variants.find(
      (v) => v.size?.trim() === s && v.color?.trim() === activeProduct.color?.trim()
    );
    if (match) {
      setSelectedProduct(match);
    } else {
      const fallback = variants.find((v) => v.size?.trim() === s);
      if (fallback) setSelectedProduct(fallback);
    }
  };

  const handleColorSelect = (c: string) => {
    if (!activeProduct) return;
    const match = variants.find(
      (v) => v.color?.trim() === c && v.size?.trim() === activeProduct.size?.trim()
    );
    if (match) {
      setSelectedProduct(match);
    } else {
      const fallback = variants.find((v) => v.color?.trim() === c);
      if (fallback) setSelectedProduct(fallback);
    }
  };

  return (
    <div className="productModal" role="dialog" aria-modal="true" aria-labelledby="productModalTitle">
      <button type="button" className="productModal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="productModal__sheet">
        <button ref={closeRef} type="button" className="productModal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="productModal__imageArea">
          {showPlaceholder ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productPlaceholderDataUri(activeProduct)} alt="" className="productModal__image" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt=""
              className="productModal__image"
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
        <div className="productModal__content">
          <h2 id="productModalTitle" className="productModal__title">
            {activeProduct.name}
          </h2>
          {activeProduct.category ? <p className="productModal__meta">{activeProduct.category}</p> : null}
          {activeProduct.size || activeProduct.color ? (
            <p className="productModal__meta">
              {[activeProduct.size, activeProduct.color].filter(Boolean).join(" · ")}
              {activeProduct.brand ? ` · ${activeProduct.brand}` : ""}
            </p>
          ) : null}
          {barcode ? <p className="productModal__meta productModal__meta--mono">{barcode}</p> : null}
          
          {uniqueColors.length > 1 ? (
            <div className="variantSection">
              <label className="variantLabel">Color</label>
              <div className="colorSelector">
                {uniqueColors.map((c) => {
                  const isActive = activeProduct.color?.trim() === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`colorChip ${isActive ? "colorChip--active" : ""}`}
                      onClick={() => handleColorSelect(c)}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {uniqueSizes.length > 1 ? (
            <div className="variantSection">
              <label className="variantLabel">Size</label>
              <div className="sizeSelector">
                {sortSizes(uniqueSizes).map((s) => {
                  const isActive = activeProduct.size?.trim() === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`sizeChip ${isActive ? "sizeChip--active" : ""}`}
                      onClick={() => handleSizeSelect(s)}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p className="productModal__stock">
            Availability:{" "}
            {inStock > 0 ? (
              <span className="inStockText">{inStock} units in stock</span>
            ) : (
              <span className="outOfStockText">Out of Stock</span>
            )}
          </p>

          {(activeProduct.discountPercent ?? 0) > 0 ? (
            <div className="productModal__priceRow">
              <span className="productModal__badgeSale">−{activeProduct.discountPercent}%</span>
              <span className="productModal__price productModal__price--now">₹{activeProduct.unitPrice}</span>
              <span className="productModal__price productModal__price--was">₹{activeProduct.listPrice ?? activeProduct.unitPrice}</span>
            </div>
          ) : (
            <p className="productModal__price">₹{activeProduct.unitPrice}</p>
          )}
          <div className="productModal__actions">
            <div className="qtyStepper qtyStepper--lg" aria-label="Quantity">
              <button
                type="button"
                className="qtyStepper__btn"
                disabled={!canAct || qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="qtyStepper__val">{qty}</span>
              <button
                type="button"
                className="qtyStepper__btn"
                disabled={!canAct || qty >= 99}
                onClick={() => setQty((q) => Math.min(99, q + 1))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="btnPrimary btnPrimary--stretch"
              disabled={!canAct || loading}
              onClick={() => {
                if (barcode) onAdd(barcode, qty);
              }}
            >
              {isOutOfStock ? "Out of stock" : "Add to bag"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
