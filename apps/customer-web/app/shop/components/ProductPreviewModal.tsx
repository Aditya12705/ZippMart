"use client";

import { useEffect, useRef, useState } from "react";
import type { RecommendationProduct } from "../lib/shopConfig";
import { productPlaceholderDataUri } from "../lib/productPlaceholder";

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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setQty(1);
  }, [product?.id]);

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
  const barcode = product.barcode?.trim();
  const canAct = Boolean(barcode) && !disabled;

  return (
    <div className="productModal" role="dialog" aria-modal="true" aria-labelledby="productModalTitle">
      <button type="button" className="productModal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="productModal__sheet">
        <button ref={closeRef} type="button" className="productModal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="productModal__imageArea">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" className="productModal__image" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productPlaceholderDataUri(product)} alt="" className="productModal__image" />
          )}
        </div>
        <div className="productModal__content">
          <h2 id="productModalTitle" className="productModal__title">
            {product.name}
          </h2>
          {product.category ? <p className="productModal__meta">{product.category}</p> : null}
          {barcode ? <p className="productModal__meta productModal__meta--mono">{barcode}</p> : null}
          {(product.discountPercent ?? 0) > 0 ? (
            <div className="productModal__priceRow">
              <span className="productModal__badgeSale">−{product.discountPercent}%</span>
              <span className="productModal__price productModal__price--now">₹{product.unitPrice}</span>
              <span className="productModal__price productModal__price--was">₹{product.listPrice ?? product.unitPrice}</span>
            </div>
          ) : (
            <p className="productModal__price">₹{product.unitPrice}</p>
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
              Add to bag
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
