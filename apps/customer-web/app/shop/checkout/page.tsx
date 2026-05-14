"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiBase, useShop, type CheckoutResult } from "../context/ShopContext";
import { downloadReceiptHtml, type PaidReceipt } from "../lib/receiptDownload";

type ExitPass = {
  exitQr: string;
  grandTotal: number;
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
  const [counterSnapshot, setCounterSnapshot] = useState<{
    subtotal: number;
    tax: number;
    total: number;
  } | null>(null);
  const [copyHint, setCopyHint] = useState("");
  const [paidReceipt, setPaidReceipt] = useState<PaidReceipt | null>(null);
  const [exitPass, setExitPass] = useState<ExitPass | null>(null);
  const [waitingPayment, setWaitingPayment] = useState(false);
  const [exitLoading, setExitLoading] = useState(false);

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

    const loadReceipt = async () => {
      const resp = await fetch(`${apiBase}/v1/customer/orders/${encodeURIComponent(result.orderId)}/receipt`);
      if (!resp.ok) return false;
      const data = (await resp.json()) as PaidReceipt;
      if (!cancelled) {
        setPaidReceipt(data);
        setWaitingPayment(false);
      }
      return true;
    };

    const tick = async () => {
      if (cancelled || paidReceipt) return;
      const statusResp = await fetch(`${apiBase}/v1/customer/orders/${encodeURIComponent(result.orderId)}`);
      if (!statusResp.ok) return;
      const status = (await statusResp.json()) as { paid: boolean };
      if (status.paid) {
        await loadReceipt();
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [result?.orderId, result?.tokenNumber, paidReceipt]);

  async function continueToExit() {
    if (!result?.orderId) return;
    setExitLoading(true);
    try {
      const resp = await fetch(`${apiBase}/v1/customer/orders/${encodeURIComponent(result.orderId)}/exit-pass`);
      if (!resp.ok) {
        setMessage("Could not load exit pass. Try again.");
        return;
      }
      const data = (await resp.json()) as ExitPass;
      setExitPass(data);
    } catch {
      setMessage("Could not load exit pass.");
    } finally {
      setExitLoading(false);
    }
  }

  async function pay(mode: "ONLINE" | "COUNTER") {
    if (mode === "ONLINE") {
      setMessage("Online payment (Razorpay) is not wired up yet. Please pay at the counter.");
      return;
    }
    const snap = { subtotal: cart.subtotal, tax: cart.taxTotal, total: cart.grandTotal };
    const r = await checkout(mode, {
      receiptEmail: receiptEmail.trim() || undefined
    });
    setResult(r);
    setCounterSnapshot(r ? snap : null);
    setPaidReceipt(null);
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
  const showReceipt = isCounter && paidReceipt != null && !showExit;

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
            <p className="checkoutReceiptOpts__label">Email receipt (optional)</p>
            <p className="checkoutReceiptOpts__hint">
              We&apos;ll email a copy after the cashier confirms payment, if the store has email delivery enabled.
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
          <Link href="/shop" className="btnPrimary btnPrimary--full checkoutResult__done">
            Done · shop again
          </Link>
        </section>
      ) : showReceipt && paidReceipt ? (
        <section className="eReceipt">
          <p className="counterSuccess__eyebrow">Payment confirmed</p>
          <h2 className="eReceipt__title">Your receipt</h2>
          <p className="eReceipt__meta">
            {paidReceipt.receiptNumber} · {paidReceipt.storeCode}
          </p>
          <div className="eReceipt__card checkoutBill">
            <ul className="checkoutBill__items">
              {paidReceipt.lines.map((line) => (
                <li key={`${line.name}-${line.qty}`}>
                  <span>
                    {line.name} × {line.qty}
                  </span>
                  <span>₹{line.lineTotal.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="checkoutBill__divider" />
            <div className="checkoutBill__row">
              <span>Subtotal</span>
              <span>₹{paidReceipt.subtotal.toFixed(2)}</span>
            </div>
            <div className="checkoutBill__row">
              <span>Tax</span>
              <span>₹{paidReceipt.taxTotal.toFixed(2)}</span>
            </div>
            <div className="checkoutBill__row checkoutBill__row--total">
              <span>Total paid</span>
              <span>₹{paidReceipt.grandTotal.toFixed(2)}</span>
            </div>
          </div>
          {paidReceipt.receiptEmail && paidReceipt.emailConfigured ? (
            <p className="eReceipt__emailNote">A copy is being sent to {paidReceipt.receiptEmail}.</p>
          ) : paidReceipt.receiptEmail ? (
            <p className="eReceipt__emailNote">Email saved — on-screen receipt is your copy for now.</p>
          ) : null}
          <button type="button" className="btnGhost btnGhost--full" onClick={() => downloadReceiptHtml(paidReceipt)}>
            Download receipt
          </button>
          <button type="button" className="btnPrimary btnPrimary--full" disabled={exitLoading} onClick={() => void continueToExit()}>
            {exitLoading ? "Loading exit pass…" : "Continue to exit gate"}
          </button>
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
              ? "Waiting for the cashier to confirm payment…"
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
