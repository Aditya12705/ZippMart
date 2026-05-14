"use client";

import { useCallback, useEffect, useState } from "react";
import { apiBase, cashierHeaders } from "../lib/api";
const RECENT_KEY = "zippmart-cashier-recent";
const MAX_RECENT = 8;

type OrderLine = {
  name: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
};

type OrderView = {
  orderId: string;
  tokenNumber: number | null;
  paid: boolean;
  paymentMode: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: OrderLine[];
};

type RecentEntry = { ref: string; label: string; at: number };

type PendingRow = {
  orderId: string;
  tokenNumber: number | null;
  grandTotal: number;
  lineCount: number;
  createdAt: string;
};

type TodayStats = {
  paidCount: number;
  pendingCount: number;
  revenueToday: number;
};

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(entries: RecentEntry[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function CashierHomePage() {
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [settleMsg, setSettleMsg] = useState("");
  const [copyToast, setCopyToast] = useState("");
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const [pResp, sResp] = await Promise.all([
        fetch(`${apiBase}/v1/cashier/pending`, { headers: cashierHeaders() }),
        fetch(`${apiBase}/v1/cashier/stats/today`, { headers: cashierHeaders() })
      ]);
      if (pResp.ok) setPending(await pResp.json());
      if (sResp.ok) setStats(await sResp.json());
    } catch {
      /* queue is optional if API unreachable */
    }
  }, []);

  useEffect(() => {
    setRecent(loadRecent());
    void loadQueue();
    const t = window.setInterval(() => void loadQueue(), 15000);
    return () => window.clearInterval(t);
  }, [loadQueue]);

  const pushRecent = useCallback((raw: string, o: OrderView) => {
    const label =
      o.tokenNumber != null ? `Token #${o.tokenNumber}` : `Order ${o.orderId.slice(0, 8)}…`;
    const next = [{ ref: raw.trim(), label, at: Date.now() }, ...loadRecent().filter((x) => x.ref !== raw.trim())];
    saveRecent(next);
    setRecent(next.slice(0, MAX_RECENT));
  }, []);

  const lookup = useCallback(
    async (overrideRef?: string) => {
      const raw = (overrideRef ?? ref).trim();
      setError("");
      setSettleMsg("");
      setOrder(null);
      if (!raw) {
        setError("Enter an order ID or counter token number.");
        return;
      }
      setLoading(true);
      try {
        let url: string;
        if (looksLikeUuid(raw)) {
          url = `${apiBase}/v1/cashier/orders/${encodeURIComponent(raw)}`;
        } else {
          const token = Number(raw.replace(/^#/, ""));
          if (!Number.isFinite(token)) {
            setError("Use a full order ID (UUID) or a numeric counter token.");
            setLoading(false);
            return;
          }
          url = `${apiBase}/v1/cashier/orders/by-token/${encodeURIComponent(String(token))}`;
        }
        const resp = await fetch(url, { headers: cashierHeaders() });
        const data = (await resp.json()) as OrderView & { message?: string };
        if (!resp.ok) {
          setError(typeof data.message === "string" ? data.message : "Lookup failed");
          return;
        }
        setOrder(data);
        setRef(raw);
        pushRecent(raw, data);
      } catch {
        setError(`Cannot reach API at ${apiBase}`);
      } finally {
        setLoading(false);
      }
    },
    [ref, pushRecent]
  );

  async function settle() {
    if (!order) return;
    setSettleMsg("");
    setLoading(true);
    try {
      const resp = await fetch(`${apiBase}/v1/cashier/orders/${encodeURIComponent(order.orderId)}/settle`, {
        method: "POST",
        headers: cashierHeaders(true)
      });
      const data = (await resp.json()) as { ok?: boolean; message?: string };
      if (!resp.ok) {
        setSettleMsg(data.message ?? "Could not record payment");
        return;
      }
      setSettleMsg("Payment recorded.");
      setOrder((o) => (o ? { ...o, paid: true } : null));
      void loadQueue();
    } catch {
      setSettleMsg(`Cannot reach API at ${apiBase}`);
    } finally {
      setLoading(false);
    }
  }

  function flashCopy(ok: boolean) {
    setCopyToast(ok ? "Copied" : "Copy blocked — select text manually");
    window.setTimeout(() => setCopyToast(""), 2200);
  }

  function newLookup() {
    setRef("");
    setOrder(null);
    setError("");
    setSettleMsg("");
    setCopyToast("");
  }

  return (
    <div className="shell">
      <header className="header">
        <p className="header__eyebrow">ZippMart</p>
        <h1 className="header__title">Counter</h1>
        <p className="header__sub">
          Look up queue tokens or order IDs, verify the basket, then settle cash or card at the till.
        </p>
      </header>

      {stats ? (
        <div className="statsRow" aria-label="Today at counter">
          <div className="statPill">
            <span className="statPill__label">Paid today</span>
            <span className="statPill__value">{stats.paidCount}</span>
          </div>
          <div className="statPill">
            <span className="statPill__label">Awaiting pay</span>
            <span className="statPill__value">{stats.pendingCount}</span>
          </div>
          <div className="statPill statPill--accent">
            <span className="statPill__label">Revenue today</span>
            <span className="statPill__value">₹{stats.revenueToday.toFixed(2)}</span>
          </div>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section className="queuePanel" aria-label="Counter queue">
          <p className="queuePanel__title">Waiting for payment ({pending.length})</p>
          <div className="queueChips">
            {pending.map((p) => (
              <button
                key={p.orderId}
                type="button"
                className="queueChip"
                onClick={() => void lookup(p.tokenNumber != null ? String(p.tokenNumber) : p.orderId)}
              >
                {p.tokenNumber != null ? `#${p.tokenNumber}` : p.orderId.slice(0, 8)}
                <span className="queueChip__amt">₹{p.grandTotal.toFixed(0)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="lookup">
        <input
          className="lookup__input"
          placeholder="Order ID or token #"
          title="USB scanners usually type the code and press Enter — lookup runs automatically."
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
          aria-label="Order ID or token number"
        />
        <button type="button" className="btn" disabled={loading} onClick={() => void lookup()}>
          {loading ? "…" : "Look up"}
        </button>
      </div>

      {recent.length > 0 ? (
        <div className="recentBlock">
          <p className="recentBlock__label">Recent</p>
          <div className="recentChips">
            {recent.map((r) => (
              <button
                key={`${r.ref}-${r.at}`}
                type="button"
                className="recentChip"
                onClick={() => void lookup(r.ref)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="hint">Counter customers see a token (e.g. 1001). Full UUID works for any order channel.</p>

      {error ? <div className="err">{error}</div> : null}
      {copyToast ? <div className="copyToast">{copyToast}</div> : null}

      {order ? (
        <>
          <div className="actionBar">
            <button type="button" className="btnGhost" onClick={() => void newLookup()}>
              New lookup
            </button>
            <button type="button" className="btnGhost" onClick={() => void copyText(order.orderId).then(flashCopy)}>
              Copy order ID
            </button>
            {order.tokenNumber != null ? (
              <button
                type="button"
                className="btnGhost"
                onClick={() => void copyText(String(order.tokenNumber)).then(flashCopy)}
              >
                Copy token
              </button>
            ) : null}
            <button type="button" className="btnGhost btnGhost--print" onClick={() => window.print()}>
              Print / PDF
            </button>
          </div>

          {order.tokenNumber != null ? (
            <div className="token">
              <p className="token__label">Counter queue</p>
              <p className="token__num">#{order.tokenNumber}</p>
            </div>
          ) : null}

          <div className="card receiptCard">
            <span className={`badge${order.paid ? " badge--paid" : " badge--wait"}`}>
              {order.paid ? "Paid" : "Awaiting payment"}
            </span>
            <p className="card__title">Order {order.orderId.slice(0, 8)}…</p>
            <ul className="lines">
              {order.lines.map((line, i) => (
                <li key={`${line.name}-${i}`} className="line">
                  <div>
                    {line.name}
                    <span className="line__meta">
                      {line.qty} × ₹{line.unitPrice} · tax {line.taxPercent}%
                    </span>
                  </div>
                  <div>₹{line.lineTotal.toFixed(2)}</div>
                </li>
              ))}
            </ul>
            <div className="totals">
              <div className="totalRow">
                <span>Subtotal (excl. tax)</span>
                <span>₹{order.subtotal.toFixed(2)}</span>
              </div>
              <div className="totalRow">
                <span>Tax</span>
                <span>₹{order.taxTotal.toFixed(2)}</span>
              </div>
              <div className="totalRow totalRow--grand">
                <span>Total due</span>
                <span>₹{order.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {order.paymentMode === "COUNTER" && !order.paid ? (
            <button type="button" className="btn btn--xl" disabled={loading} onClick={() => void settle()}>
              Record payment at counter
            </button>
          ) : null}

          {order.paymentMode === "COUNTER" && order.paid ? (
            <p className="hint" style={{ textAlign: "center" }}>
              This order is already marked paid.
            </p>
          ) : null}

          {order.paymentMode === "ONLINE" ? (
            <p className="hint" style={{ textAlign: "center" }}>
              Online payment orders are settled via the payment provider, not this screen.
            </p>
          ) : null}

          {settleMsg ? <div className="card settleBanner">{settleMsg}</div> : null}
        </>
      ) : null}
    </div>
  );
}
