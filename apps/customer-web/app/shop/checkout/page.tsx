"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiBase, useShop, type CheckoutResult } from "../context/ShopContext";

type ExitPass = {
  exitQr: string;
  grandTotal: number;
  receiptEmail: string | null;
  receiptPhone: string | null;
  receiptDelivery: "webhook" | "none";
};

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
  const { hydrated, sessionId, cart, refreshCart, loading, checkout, message, setMessage } = useShop();
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
  const [exitPass, setExitPass] = useState<ExitPass | null>(null);
  const [waitingPayment, setWaitingPayment] = useState(false);

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

  useEffect(() => {
    if (!result?.orderId || result.tokenNumber == null) return;
    let cancelled = false;
    setWaitingPayment(true);

    const loadExit = async () => {
      const resp = await fetch(`${apiBase}/v1/customer/orders/${encodeURIComponent(result.orderId)}/exit-pass`);
      if (!resp.ok) return false;
      const data = (await resp.json()) as ExitPass;
      if (!cancelled) {
        setExitPass(data);
        setWaitingPayment(false);
      }
      return true;
    };

    const tick = async () => {
      if (cancelled) return;
      const statusResp = await fetch(`${apiBase}/v1/customer/orders/${encodeURIComponent(result.orderId)}`);
      if (!statusResp.ok) return;
      const status = (await statusResp.json()) as { paid: boolean };
      if (status.paid) {
        await loadExit();
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [result?.orderId, result?.tokenNumber]);

  async function pay(mode: "ONLINE" | "COUNTER") {
    if (mode === "ONLINE") {
      setMessage("Online payment (Razorpay) is not wired up yet. Please pay at the counter.");
      return;
    }
    const snap = { subtotal: cart.subtotal, tax: cart.taxTotal, total: cart.grandTotal };
    const r = await checkout(mode, {
      receiptEmail: receiptEmail.trim() || undefined,
      receiptPhone: receiptPhone.trim() || undefined
    });
    setResult(r);
    setCounterSnapshot(r ? snap : null);
    setExitPass(null);
    setWaitingPayment(Boolean(r?.tokenNumber != null));
    if (r) void refreshCart();
  }

  if (!hydrated || !sessionId || !cartSynced || (cart.items.length === 0 && !result)) {
    return (
      <main className="pageCanvas pageCanvas--checkout">
        <div className="skeletonLine" style={{ marginTop: 24 }} />
      </main>
    );
  }

  const isCounter = result?.tokenNumber != null;
  const showExit = isCounter && exitPass != null;

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
            <p className="checkoutReceiptOpts__label">E-receipt (optional)</p>
            <p className="checkoutReceiptOpts__hint">
              We save your contact details on the order. After the cashier confirms payment, the store can send a
              receipt by email or WhatsApp if that service is enabled on the backend.
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
              <span>Phone (WhatsApp)</span>
              <input
                type="tel"
                autoComplete="tel"
                placeholder="10-digit mobile"
                value={receiptPhone}
                onChange={(e) => setReceiptPhone(e.target.value)}
              />
            </label>
          </section>

          <section className="checkoutActions">
            <p className="checkoutActions__label">Choose payment</p>
            <button
              type="button"
              className="btnGhost btnGhost--full btnGhost--disabledLook"
              disabled
              title="Razorpay integration coming soon"
            >
              Pay online (UPI / card) — coming soon
            </button>
            <button type="button" className="btnPrimary btnPrimary--full" disabled={loading} onClick={() => void pay("COUNTER")}>
              Pay at counter
            </button>
          </section>
        </>
      ) : showExit ? (
        <section className="counterSuccess exitPass">
          <p className="counterSuccess__eyebrow">You&apos;re all set</p>
          <h2 className="exitPass__title">Show this at the exit gate</h2>
          <div className="exitPass__qrWrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={exitPass.exitQr} alt="Exit gate QR code" className="exitPass__qr" width={220} height={220} />
          </div>
          <p className="exitPass__hint">Valid for 15 minutes · one scan at the gate</p>
          <div className="checkoutBill checkoutBill--compact">
            <div className="checkoutBill__row checkoutBill__row--total">
              <span>Paid</span>
              <span>₹{exitPass.grandTotal.toFixed(2)}</span>
            </div>
          </div>
          {exitPass.receiptEmail || exitPass.receiptPhone ? (
            <p className="exitPass__receipt">
              {exitPass.receiptDelivery === "webhook"
                ? `Receipt queued for ${exitPass.receiptEmail ?? exitPass.receiptPhone}.`
                : "Receipt contact saved — ask staff if you do not receive it (store webhook not configured)."}
            </p>
          ) : null}
          <Link href="/shop" className="btnPrimary btnPrimary--full checkoutResult__done">
            Done · shop again
          </Link>
        </section>
      ) : isCounter ? (
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
          <p className="counterSuccess__hint">
            {waitingPayment
              ? "Waiting for the cashier to confirm payment… This screen will show your exit QR automatically."
              : "Show this screen to the cashier so they can pull up your order."}
          </p>
          {counterSnapshot ? (
            <div className="checkoutBill checkoutBill--compact">
              <div className="checkoutBill__row">
                <span>Subtotal (excl. tax)</span>
                <span>₹{counterSnapshot.subtotal.toFixed(2)}</span>
              </div>
              <div className="checkoutBill__row">
                <span>Tax</span>
                <span>₹{counterSnapshot.tax.toFixed(2)}</span>
              </div>
              <div className="checkoutBill__row checkoutBill__row--total">
                <span>Amount due</span>
                <span>₹{counterSnapshot.total.toFixed(2)}</span>
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
          {waitingPayment ? <p className="inlineNotice inlineNotice--pulse">Checking payment status…</p> : null}
        </section>
      ) : (
        <section className="checkoutResult panel">
          <h2 className="checkoutBill__heading">Online payment</h2>
          <p className="checkoutResult__rzp">
            Razorpay checkout is not connected yet. Order <code>{result.orderId}</code> was created but cannot be paid
            online. Use <strong>Pay at counter</strong> from your bag instead.
          </p>
          <Link href="/shop/cart" className="btnPrimary btnPrimary--full checkoutResult__done">
            Back to bag
          </Link>
        </section>
      )}

      {message ? <div className="toast">{message}</div> : null}
    </main>
  );
}
