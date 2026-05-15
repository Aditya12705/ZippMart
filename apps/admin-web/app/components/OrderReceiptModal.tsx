"use client";

import { useEffect } from "react";
import type { PaidReceipt } from "../../lib/receipt";
import { downloadReceiptHtml } from "../../lib/receipt";

function money(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  receipt: PaidReceipt | null;
  onClose: () => void;
};

export function OrderReceiptModal({ open, loading, error, receipt, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="adminModalBackdrop" onClick={onClose} role="presentation">
      <div
        className="adminModal adminModal--receipt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adminModal__header">
          <div>
            <p className="adminModal__eyebrow">Order receipt</p>
            <h2 id="receipt-modal-title" className="adminModal__title">
              {receipt?.receiptNumber ?? "Receipt"}
            </h2>
            {receipt ? (
              <p className="adminModal__meta">
                {receipt.storeCode} · {new Date(receipt.createdAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <button type="button" className="adminModal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="adminModal__body">
          {loading ? <p className="muted">Loading receipt…</p> : null}
          {!loading && error ? <p className="formError">{error}</p> : null}
          {!loading && receipt ? (
            <>
              <p className="receiptModal__meta mono" title={receipt.orderId}>
                Order {receipt.orderId.slice(0, 8)}… · {receipt.paymentMode}
                {receipt.tokenNumber != null ? ` · Counter #${receipt.tokenNumber}` : ""}
              </p>
              <ul className="receiptModal__lines">
                {receipt.lines.map((line) => (
                  <li key={`${line.name}-${line.qty}`}>
                    <span>
                      {line.name} × {line.qty}
                    </span>
                    <span>{money(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="receiptModal__totals">
                <div>
                  <span>Subtotal</span>
                  <span>{money(receipt.subtotal)}</span>
                </div>
                <div>
                  <span>Tax</span>
                  <span>{money(receipt.taxTotal)}</span>
                </div>
                <div className="receiptModal__grand">
                  <span>Total paid</span>
                  <span>{money(receipt.grandTotal)}</span>
                </div>
              </div>
              {receipt.receiptEmail ? (
                <p className="muted receiptModal__email">Customer email: {receipt.receiptEmail}</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="adminModal__footer">
          <button type="button" className="adminBtn adminBtn--ghost" onClick={onClose}>
            Close
          </button>
          {receipt ? (
            <button type="button" className="adminBtn" onClick={() => downloadReceiptHtml(receipt)}>
              Download HTML
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
