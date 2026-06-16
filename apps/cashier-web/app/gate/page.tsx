"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { QrCameraScanner } from "../components/QrCameraScanner";
import { apiBase } from "../../lib/api";

type VerifyResult =
  | { state: "ok"; orderId: string }
  | { state: "fail"; reason: string };

export default function GatePage() {
  const [cameraOn, setCameraOn] = useState(true);
  const [manualToken, setManualToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const verifyToken = useCallback(async (raw: string) => {
    const token = raw.trim();
    if (!token) return;
    setVerifying(true);
    setResult(null);
    try {
      const resp = await fetch(`${apiBase}/v1/gate/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = (await resp.json()) as { valid?: boolean; orderId?: string; reason?: string };
      if (data.valid && data.orderId) {
        setResult({ state: "ok", orderId: data.orderId });
        setCameraOn(false);
      } else {
        setResult({ state: "fail", reason: data.reason ?? "Invalid exit pass" });
      }
    } catch {
      setResult({ state: "fail", reason: "Could not reach API" });
    } finally {
      setVerifying(false);
    }
  }, []);

  function scanAgain() {
    setResult(null);
    setManualToken("");
    setCameraOn(true);
  }

  return (
    <div className="shell">
      <header className="header">
        <p className="header__eyebrow">SeamLine</p>
        <h1 className="header__title">Exit gate</h1>
        <p className="header__sub">Scan the customer&apos;s exit QR after they have paid. Each code works once.</p>
        <Link href="/" className="gateBack">
          ← Back to counter
        </Link>
      </header>

      {result?.state === "ok" ? (
        <section className="gateResult gateResult--ok" aria-live="polite">
          <p className="gateResult__eyebrow">Verified</p>
          <h2 className="gateResult__title">Customer may exit</h2>
          <p className="gateResult__meta">
            Order <code>{result.orderId}</code>
          </p>
          <button type="button" className="btnPrimary btnPrimary--full" onClick={scanAgain}>
            Scan next customer
          </button>
        </section>
      ) : (
        <>
          {cameraOn ? (
            <QrCameraScanner
              active={!verifying}
              onDecoded={(text) => {
                void verifyToken(text);
              }}
            />
          ) : (
            <button type="button" className="btnGhost btnGhost--full" onClick={() => setCameraOn(true)}>
              Turn camera on
            </button>
          )}

          <section className="gateManual" aria-label="Manual token entry">
            <label className="field">
              <span className="field__label">Or paste exit token</span>
              <textarea
                className="gateManual__input"
                rows={3}
                placeholder="JWT from QR decode"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btnPrimary btnPrimary--full"
              disabled={verifying || !manualToken.trim()}
              onClick={() => void verifyToken(manualToken)}
            >
              {verifying ? "Verifying…" : "Verify token"}
            </button>
          </section>

          {result?.state === "fail" ? (
            <p className="gateResult gateResult--fail" role="alert">
              {result.reason}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
