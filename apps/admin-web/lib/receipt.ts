export type ReceiptLine = {
  name: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
  lineTotal: number;
};

export type PaidReceipt = {
  receiptNumber: string;
  orderId: string;
  storeCode: string;
  createdAt: string;
  paymentMode: string;
  lines: ReceiptLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  receiptEmail: string | null;
  emailConfigured: boolean;
  tokenNumber: number | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function receiptHtml(receipt: PaidReceipt): string {
  const rows = receipt.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.name)}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">₹${l.lineTotal.toFixed(2)}</td></tr>`
    )
    .join("");
  const when = new Date(receipt.createdAt).toLocaleString();
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"/>',
    `<title>SeamLine receipt ${escapeHtml(receipt.receiptNumber)}</title>`,
    "<style>",
    "body{font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;color:#0f172a}",
    "h1{font-size:1.25rem;margin:0 0 4px}",
    ".meta{color:#64748b;font-size:14px;margin-bottom:16px}",
    "table{width:100%;border-collapse:collapse;font-size:14px}",
    "td{padding:8px 0;border-bottom:1px solid #e2e8f0}",
    ".totals{margin-top:16px;font-size:14px}",
    ".totals div{display:flex;justify-content:space-between;padding:4px 0}",
    ".grand{font-weight:700;font-size:1.1rem;border-top:2px solid #0f172a;padding-top:8px;margin-top:8px}",
    "</style></head><body>",
    "<h1>SeamLine</h1>",
    `<p class="meta">Receipt ${escapeHtml(receipt.receiptNumber)} · ${escapeHtml(receipt.storeCode)}<br>${when}</p>`,
    `<table><tbody>${rows}</tbody></table>`,
    '<div class="totals">',
    `<div><span>Subtotal</span><span>₹${receipt.subtotal.toFixed(2)}</span></div>`,
    `<div><span>Tax</span><span>₹${receipt.taxTotal.toFixed(2)}</span></div>`,
    `<div class="grand"><span>Total paid</span><span>₹${receipt.grandTotal.toFixed(2)}</span></div>`,
    "</div>",
    `<p class="meta">Order ${escapeHtml(receipt.orderId)}</p>`,
    "</body></html>"
  ].join("");
}

export function downloadReceiptHtml(receipt: PaidReceipt): void {
  const html = receiptHtml(receipt);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seamline-receipt-${receipt.receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
