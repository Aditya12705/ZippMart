"use client";

import { useEffect, useRef, useState } from "react";

type Product = {
  id: string;
  name: string;
  barcode: string;
  inStock: number;
  reservedQty?: number;
  availableQty?: number;
};

type Props = {
  product: Product | null;
  busy: boolean;
  onClose: () => void;
  onSave: (next: number) => void;
};

export function StockAdjustModal({ product, busy, onClose, onSave }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setValue(String(product.inStock));
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  if (!product) return null;

  const parsed = Math.max(0, Math.floor(Number(value)));
  const valid = value.trim() !== "" && Number.isFinite(Number(value));
  const delta = valid ? parsed - product.inStock : 0;

  function bump(amount: number) {
    const base = valid ? parsed : product!.inStock;
    setValue(String(Math.max(0, base + amount)));
  }

  function submit() {
    if (!valid || busy) return;
    onSave(parsed);
  }

  return (
    <div className="adminModalBackdrop" onClick={onClose} role="presentation">
      <div
        className="adminModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adminModal__header">
          <div>
            <p className="adminModal__eyebrow">Update inventory</p>
            <h2 id="stock-modal-title" className="adminModal__title">
              {product.name}
            </h2>
            <p className="adminModal__meta mono">{product.barcode}</p>
          </div>
          <button type="button" className="adminModal__close" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="adminModal__body">
          <p className="adminModal__current">
            On hand: <strong>{product.inStock}</strong>
            {product.reservedQty != null && product.reservedQty > 0 ? (
              <>
                {" "}
                · Reserved: <strong>{product.reservedQty}</strong>
              </>
            ) : null}
            {product.availableQty != null ? (
              <>
                {" "}
                · Available: <strong>{product.availableQty}</strong>
              </>
            ) : null}
          </p>

          <label className="adminModal__field">
            <span>New quantity on hand</span>
            <input
              ref={inputRef}
              className="adminModal__input"
              inputMode="numeric"
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </label>

          <div className="adminModal__quick">
            <button type="button" className="adminBtn adminBtn--ghost adminBtn--small" disabled={busy} onClick={() => bump(-10)}>
              −10
            </button>
            <button type="button" className="adminBtn adminBtn--ghost adminBtn--small" disabled={busy} onClick={() => bump(-1)}>
              −1
            </button>
            <button type="button" className="adminBtn adminBtn--ghost adminBtn--small" disabled={busy} onClick={() => bump(1)}>
              +1
            </button>
            <button type="button" className="adminBtn adminBtn--ghost adminBtn--small" disabled={busy} onClick={() => bump(10)}>
              +10
            </button>
          </div>

          {valid && delta !== 0 ? (
            <p className={`adminModal__delta${delta > 0 ? " adminModal__delta--up" : " adminModal__delta--down"}`}>
              {delta > 0 ? `+${delta}` : delta} units from current shelf count
            </p>
          ) : null}
        </div>

        <div className="adminModal__footer">
          <button type="button" className="adminBtn adminBtn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adminBtn" disabled={!valid || busy} onClick={submit}>
            {busy ? "Saving…" : "Save stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
