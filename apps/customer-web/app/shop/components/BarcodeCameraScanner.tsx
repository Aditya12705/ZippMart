"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  active: boolean;
  onClose: () => void;
  onDecoded: (text: string) => void;
};

export function BarcodeCameraScanner({ active, onClose, onDecoded }: Props) {
  const readerId = useId().replace(/:/g, "");
  const readerElementId = `barcode-camera-${readerId}`;
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const onDecodedRef = useRef(onDecoded);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
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
      return;
    }

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
        if (cancelled) return;

        if (!document.getElementById(readerElementId)) {
          if (!cancelled) setError("Scanner view not ready");
          return;
        }

        const formats = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.QR_CODE
        ];

        const html5 = new Html5Qrcode(readerElementId, {
          formatsToSupport: formats,
          useBarCodeDetectorIfSupported: true,
          verbose: false
        });
        if (cancelled) {
          try {
            html5.clear();
          } catch {
            /* ignore */
          }
          return;
        }

        scannerRef.current = html5;

        await html5.start(
          { facingMode: "environment" },
          {
            fps: 8,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const w = Math.min(320, Math.floor(viewfinderWidth * 0.92));
              const h = Math.min(220, Math.floor(viewfinderHeight * 0.42));
              return { width: w, height: h };
            },
            aspectRatio: 1.777777778,
            videoConstraints: { facingMode: { ideal: "environment" } }
          },
          (decodedText) => {
            const now = Date.now();
            if (decodedText === lastRef.current.text && now - lastRef.current.at < 2200) return;
            lastRef.current = { text: decodedText, at: now };
            onDecodedRef.current(decodedText);
          },
          () => undefined
        );
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not open camera. Allow camera permission and use HTTPS or localhost."
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [active, stopScanner, readerElementId]);

  if (!active) return null;

  return (
    <div className="scanCamera">
      <div className="scanCamera__toolbar">
        <span className="scanCamera__label">Point at barcode</span>
        <button
          type="button"
          className="scanCamera__close"
          onClick={() => {
            void stopScanner().then(onClose);
          }}
        >
          Close camera
        </button>
      </div>
      <div id={readerElementId} className="scanCamera__viewport" />
      {starting ? <p className="scanCamera__hint">Starting camera…</p> : null}
      {error ? <p className="scanCamera__err">{error}</p> : null}
    </div>
  );
}
