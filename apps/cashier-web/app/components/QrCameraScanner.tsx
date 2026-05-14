"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  active: boolean;
  onDecoded: (text: string) => void;
};

export function QrCameraScanner({ active, onDecoded }: Props) {
  const readerId = useId().replace(/:/g, "");
  const readerElementId = `gate-qr-${readerId}`;
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const onDecodedRef = useRef(onDecoded);
  const consumedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  onDecodedRef.current = onDecoded;

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
    } catch {
      /* ignore */
    }
    try {
      s.clear();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!active) {
      void stopScanner();
      setError(null);
      setStarting(false);
      consumedRef.current = false;
      return;
    }

    consumedRef.current = false;
    let cancelled = false;
    setStarting(true);
    setError(null);

    void (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        await stopScanner();
        if (cancelled) return;
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled || !document.getElementById(readerElementId)) return;

        const scanner = new Html5Qrcode(readerElementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          (text) => {
            if (consumedRef.current) return;
            consumedRef.current = true;
            void stopScanner();
            onDecodedRef.current(text);
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open camera");
          setStarting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [active, readerElementId, stopScanner]);

  return (
    <div className="gateScan">
      <div id={readerElementId} className="gateScan__view" />
      {starting ? <p className="gateScan__status">Starting camera…</p> : null}
      {error ? <p className="gateScan__error">{error}</p> : null}
    </div>
  );
}
