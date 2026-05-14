"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useShop, type CheckoutResult } from "../context/ShopContext";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { hydrated, sessionId, cart, refreshCart, loading, checkout, message } = useShop();
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [cartSynced, setCartSynced] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptPhone, setReceiptPhone] = useState("");
  const [counterSnapshot, setCounterSnapshot] = useState<{
    subtotal: number;
    tax: number;
    total: number;
  } | null>(null);
  const [copyHint, setCopyHint] = useState("");

  const flashCopy = useCallback((ok: boolean) => {
    setCopyHint(ok ? "Copied to clipboard" : "Could not copy — select text manually");
    window.setTimeout(() => setCopyHint(""), 2800);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionId) {
      router.replace("/shop");
      return;
    }
    void refreshCart().finally(() => setCartSynced(true));
  }, [hydrated, sessionId, router, refreshCart]);

  useEffect(() => {
    if (!cartSynced) return;
    if (cart.items.length === 0 && !result) {
      router.replace("/shop/cart");
    }
  }, [cartSynced, cart.items.length, result, router]);

  async function pay(mode: "ONLINE" | "COUNTER") {
    const snap =
      mode === "COUNTER" ? { subtotal: cart.subtotal, tax: cart.taxTotal, total: cart.grandTotal } : null;
    const r = await checkout(mode, {
      receiptEmail: receiptEmail.trim() || undefined,
      receiptPhone: receiptPhone.trim() || undefined
    });
    setResult(r);
    setCounterSnapshot(r && mode === "COUNTER" && snap ? snap : null);
    if (r) void refreshCart();
  }

  if (!hydrated || !sessionId || !cartSynced || (cart.items.length === 0 && !result)) {
    return (
      <main className="pageCanvas pageCanvas--checkout">
        <div className="skeletonLine" style={{ marginTop: 24 }} />
      </main>
    );
  }

  const isCounterPaid = result?.tokenNumber != null;
  const snap = counterSnapshot;

  return (
    <main className="pageCanvas pageCanvas--checkout">
      {!result ? (
        <>
          <section className="checkoutBill">
            <h2 className="checkoutBill__heading">Your bill</h2>
            <ul className="checkoutBill__items">
              {cart.items.map((line) => (
                <li key={`${line.name}-${line.qty}`}>
                  <span>
                    {line.name} × {line.qty}
                    <span className="checkoutBill__lineHint">Line total (incl. tax)</span>
                  </span>
                  <span>₹{line.lineTotal.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="checkoutBill__divider" />
            <div className="checkoutBill__row">
              <span>Subtotal (before tax)</span>
              <span>₹{cart.subtotal.toFixed(2)}</span>
            </div>
            <div className="checkoutBill__row">
              <span>Tax</span>
              <span>₹{cart.taxTotal.toFixed(2)}</span>
            </div>
            <div className="checkoutBill__row checkoutBill__row--total">
              <span>Total to pay</span>
              <span>₹{cart.grandTotal.toFixed(2)}</span>
            </div>
            <p className="checkoutBill__footnote">Total includes all taxes — same as the sum of each line above.</p>
          </section>

          <section className="checkoutReceiptOpts" aria-label="Receipt options">
            <p className="checkoutReceiptOpts__label">Receipt (optional)</p>
            <p className="checkoutReceiptOpts__hint">
              If your store has configured a webhook, we send these with the order for SMS or email receipts.
            </p>
            <label className="checkoutReceiptOpts__field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={receiptEmail}
                onChange={(e) => setReceiptEmail(e.target.value)}
              />
            </label>
            <label className="checkoutReceiptOpts__field">
              <span>Phone</span>
              <input
                type="tel"
                autoComplete="tel"
                placeholder="+91…"
                value={receiptPhone}
                onChange={(e) => setReceiptPhone(e.target.value)}
              />
            </label>
          </section>

          <section className="checkoutActions">
            <p className="checkoutActions__label">Choose payment</p>
            <button type="button" className="btnPrimary btnPrimary--full" disabled={loading} onClick={() => void pay("ONLINE")}>
              Pay online (UPI / card)
            </button>
            <button type="button" className="btnGhost btnGhost--full" disabled={loading} onClick={() => void pay("COUNTER")}>
              Pay at counter
            </button>
          </section>
        </>
      ) : isCounterPaid ? (
        <section className="counterSuccess">
          <p className="counterSuccess__eyebrow">Take this number to the desk</p>
          <div className="counterSuccess__tokenCard" aria-live="polite">
            <span className="counterSuccess__tokenLabel">Queue number</span>
            <span className="counterSuccess__tokenValue">#{result.tokenNumber}</span>
          </div>
          <div className="copyRow">
            <button
              type="button"
              className="btnGhost btnGhost--full"
              onClick={() => void copyToClipboard(String(result.tokenNumber)).then((ok) => flashCopy(ok))}
            >
              Copy queue #
            </button>
          </div>
          <p className="counterSuccess__hint">Show this screen to the cashier so they can pull up your order.</p>
          {snap ? (
            <div className="checkoutBill checkoutBill--compact">
              <div className="checkoutBill__row">
                <span>Subtotal (excl. tax)</span>
                <span>₹{snap.subtotal.toFixed(2)}</span>
              </div>
              <div className="checkoutBill__row">
                <span>Tax</span>
                <span>₹{snap.tax.toFixed(2)}</span>
              </div>
              <div className="checkoutBill__row checkoutBill__row--total">
                <span>Amount due</span>
                <span>₹{snap.total.toFixed(2)}</span>
              </div>
            </div>
          ) : null}
          <div className="counterSuccess__orderRef">
            <span className="counterSuccess__orderLabel">Order reference</span>
            <code className="counterSuccess__orderId">{result.orderId}</code>
          </div>
          <div className="copyRow">
            <button
              type="button"
              className="btnGhost btnGhost--full"
              onClick={() => void copyToClipboard(result.orderId).then((ok) => flashCopy(ok))}
            >
              Copy order ID
            </button>
          </div>
          {copyHint ? <p className="copyHint">{copyHint}</p> : null}
          <Link href="/shop" className="btnPrimary btnPrimary--full checkoutResult__done">
            Back to shop
          </Link>
        </section>
      ) : (
        <section className="checkoutResult panel">
          <h2 className="checkoutBill__heading">Almost there</h2>
          <p className="checkoutResult__rzp">
            Complete payment using Razorpay for order <code>{result.orderId}</code>
          </p>
          {result.razorpayOrderId ? (
            <p className="checkoutResult__rzp">
              Gateway ref <code>{result.razorpayOrderId}</code>
            </p>
          ) : null}
          <div className="copyRow">
            <button
              type="button"
              className="btnGhost btnGhost--full"
              onClick={() => void copyToClipboard(result.orderId).then((ok) => flashCopy(ok))}
            >
              Copy order ID
            </button>
          </div>
          {copyHint ? <p className="copyHint">{copyHint}</p> : null}
          <Link href="/shop" className="btnPrimary btnPrimary--full checkoutResult__done">
            Done
          </Link>
        </section>
      )}

      {message ? <div className="toast">{message}</div> : null}
    </main>
  );
}
