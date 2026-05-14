"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarcodeCameraScanner } from "../components/BarcodeCameraScanner";
import { useShop } from "../context/ShopContext";

export default function ScanPage() {
  const router = useRouter();
  const { hydrated, sessionId, loading, message, setMessage, addToCart } = useShop();
  const [code, setCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [qty, setQty] = useState(1);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionId) router.replace("/shop");
  }, [hydrated, sessionId, router]);

  useEffect(() => {
    if (hydrated && sessionId) setCameraOn(true);
  }, [hydrated, sessionId]);

  if (!hydrated || !sessionId) {
    return (
      <main className="pageCanvas">
        <div className="skeletonLine" style={{ marginTop: 24 }} />
      </main>
    );
  }

  async function submit(text?: string) {
    if (submitLock.current) return;
    const trimmed = (text ?? code).trim();
    if (!trimmed) {
      setMessage("Enter or scan a barcode");
      return;
    }
    submitLock.current = true;
    setCameraOn(false);
    try {
      const ok = await addToCart(trimmed, qty);
      if (ok) {
        setLastAdded(trimmed);
        setCode("");
        setQty(1);
      } else if (text) {
        setCode(trimmed);
      }
    } finally {
      submitLock.current = false;
    }
  }

  return (
    <main className="pageCanvas pageCanvas--scan">
      <section className="scanIntro">
        <p className="scanIntro__eyebrow">Barcode</p>
        <h2 className="scanIntro__title">Point & add</h2>
        <p className="scanIntro__text">One beep per scan — camera closes after each item. Tap scan again for the next.</p>
      </section>

      <section className="scanActions">
        {!cameraOn ? (
          <button type="button" className="btnPrimary btnPrimary--full" onClick={() => setCameraOn(true)} disabled={loading}>
            {lastAdded ? "Scan another item" : "Open camera"}
          </button>
        ) : null}
      </section>

      {cameraOn ? (
        <BarcodeCameraScanner
          active={cameraOn}
          onClose={() => setCameraOn(false)}
          onDecoded={(text) => {
            setCode(text);
            void submit(text);
          }}
        />
      ) : null}

      <section className="scanManual">
        <label className="fieldLabel" htmlFor="barcode-manual">
          Or enter code
        </label>
        <input
          id="barcode-manual"
          className="fieldInput fieldInput--mono"
          inputMode="numeric"
          placeholder="Digits on package"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <div className="scanManual__row">
          <div className="qtyStepper qtyStepper--lg" aria-label="Quantity">
            <button type="button" className="qtyStepper__btn" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span className="qtyStepper__val">{qty}</span>
            <button type="button" className="qtyStepper__btn" disabled={qty >= 99} onClick={() => setQty((q) => Math.min(99, q + 1))}>
              +
            </button>
          </div>
          <button type="button" className="btnPrimary btnPrimary--grow" disabled={loading} onClick={() => void submit()}>
            {loading ? "Adding…" : "Add to bag"}
          </button>
        </div>
        <p className="scanHelp">Supports EAN, UPC, Code 128, and QR where printed on shelf labels.</p>
        <p className="scanCartHint">
          <Link href="/shop/cart">Open your bag</Link> to review or change quantities before checkout.
        </p>
      </section>

      {message ? <div className="toast toast--narrow">{message}</div> : null}
    </main>
  );
}
