"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarcodeCameraScanner } from "../../components/BarcodeCameraScanner";
import { StockAdjustModal } from "../../components/StockAdjustModal";
import { adminFetchHeaders, clearAdminToken, getAdminRole, getAdminToken } from "../../../lib/adminAuth";

import { apiBase } from "../../../lib/api";

const CATEGORY_OPTIONS = [
  "General",
  "Grocery",
  "Dairy",
  "Beverages",
  "Snacks",
  "Produce",
  "Frozen",
  "Bakery",
  "Meat & Seafood",
  "Personal Care",
  "Household",
  "Electronics"
] as const;

type FormErrors = Partial<Record<"barcode" | "name" | "category" | "costPrice" | "sellingPrice" | "taxPercent" | "inStock" | "demandScore", string>>;

type AdminProduct = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  unitPrice: number;
  costPrice: number;
  taxPercent: number;
  inStock: number;
  demandScore: number;
  imageUrl?: string | null;
  discountPercent: number;
  effectiveUnitPrice: number;
  profitPerUnitAtList: number;
  profitPerUnitAtSale: number;
};

type Metrics = {
  orderCount: number;
  paidOrderCount: number;
  openOrderCount: number;
  totalRevenue: number;
  pendingOrderValue: number;
  averagePaidOrderValue: number;
  productCount: number;
  lowStockSkuCount: number;
  inventoryValueAtCost: number;
  inventoryValueAtList: number;
  activeDiscountCount: number;
};

type DiscountRow = {
  productId: string;
  name: string;
  barcode: string;
  category: string;
  listPrice: number;
  discountPercent: number;
  effectiveUnitPrice: number;
  profitPerUnitAtList: number;
  profitPerUnitAtSale: number;
};

type AdminOrderRow = {
  orderId: string;
  createdAt: string;
  storeCode: string;
  paid: boolean;
  voided: boolean;
  refunded: boolean;
  paymentMode: string;
  tokenNumber: number | null;
  grandTotal: number;
  lineCount: number;
};

type AuditRow = {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  detail: string;
};

function money(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("General");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [taxPercent, setTaxPercent] = useState("5");
  const [inStock, setInStock] = useState("0");
  const [demandScore, setDemandScore] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inventoryImageInputRef = useRef<HTMLInputElement>(null);
  const [imageTargetId, setImageTargetId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [barcodeConflict, setBarcodeConflict] = useState<AdminProduct | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [discountProductId, setDiscountProductId] = useState("");
  const [discountPct, setDiscountPct] = useState("10");
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [invFilter, setInvFilter] = useState("");
  const [lowStockOnlyView, setLowStockOnlyView] = useState(false);
  const [storeFilter, setStoreFilter] = useState("");
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditRow[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [stockModalProduct, setStockModalProduct] = useState<Pick<AdminProduct, "id" | "name" | "barcode" | "inStock"> | null>(null);
  const [stockModalBusy, setStockModalBusy] = useState(false);

  const formProfit = useMemo(() => {
    const sell = Number(sellingPrice);
    const cost = Number(costPrice);
    if (!Number.isFinite(sell) || !Number.isFinite(cost) || sell <= 0) return null;
    return Math.round((sell - cost) * 100) / 100;
  }, [sellingPrice, costPrice]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (lowStockOnlyView) {
      list = list.filter((p) => p.inStock < 15);
    }
    const t = invFilter.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(t) ||
        p.barcode.toLowerCase().includes(t) ||
        p.category.toLowerCase().includes(t)
    );
  }, [products, invFilter, lowStockOnlyView]);

  const lowStockCount = useMemo(() => products.filter((p) => p.inStock < 15).length, [products]);

  function resolveBarcodeConflict(code: string) {
    const trimmed = code.trim();
    if (!trimmed) {
      setBarcodeConflict(null);
      return;
    }
    const existing = products.find((p) => p.barcode === trimmed);
    setBarcodeConflict(existing ?? null);
  }

  function validateProductForm(): FormErrors {
    const errors: FormErrors = {};
    const trimmedBarcode = barcode.trim();
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    const cost = Number(costPrice);
    const sell = Number(sellingPrice);
    const tax = Number(taxPercent);
    const stock = Number(inStock);
    const demand = Number(demandScore);

    if (!trimmedBarcode) errors.barcode = "Barcode is required.";
    else if (trimmedBarcode.length < 4) errors.barcode = "Barcode must be at least 4 characters.";
    else if (products.some((p) => p.barcode === trimmedBarcode)) errors.barcode = "This barcode is already in the catalogue.";

    if (!trimmedName) errors.name = "Product name is required.";
    if (!trimmedCategory) errors.category = "Category is required.";

    if (!costPrice.trim()) errors.costPrice = "Unit cost is required.";
    else if (!Number.isFinite(cost) || cost < 0) errors.costPrice = "Enter a valid non-negative cost.";

    if (!sellingPrice.trim()) errors.sellingPrice = "Selling price is required.";
    else if (!Number.isFinite(sell) || sell <= 0) errors.sellingPrice = "Selling price must be greater than zero.";
    else if (Number.isFinite(cost) && cost > sell) errors.sellingPrice = "Selling price must be at or above unit cost.";

    if (!Number.isFinite(tax) || tax < 0 || tax > 100) errors.taxPercent = "Tax must be between 0 and 100.";
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) errors.inStock = "Stock must be a whole number ≥ 0.";
    if (!Number.isFinite(demand) || demand < 0 || demand > 100) errors.demandScore = "Demand score must be between 0 and 100.";

    return errors;
  }

  function resetProductForm() {
    setBarcode("");
    setName("");
    setCategory("General");
    setCostPrice("");
    setSellingPrice("");
    setTaxPercent("5");
    setInStock("0");
    setDemandScore("0");
    setImageUrl("");
    setImageUploading(false);
    setFormErrors({});
    setBarcodeConflict(null);
    setCameraOn(false);
  }

  function handleBarcodeInput(value: string) {
    setBarcode(value);
    setFormErrors((prev) => ({ ...prev, barcode: undefined }));
    resolveBarcodeConflict(value);
  }

  function handleBarcodeDecoded(text: string) {
    const code = text.trim();
    if (!code) return;
    handleBarcodeInput(code);
    setCameraOn(false);
    setMessage(`Barcode captured: ${code}`);
    window.setTimeout(() => nameInputRef.current?.focus(), 80);
  }

  useEffect(() => {
    const token = getAdminToken();
    setAuthed(!!token);
    setAdminRole(getAdminRole());
    setAuthChecked(true);
    if (!token) router.replace("/admin");
  }, [router]);

  const loadProducts = useCallback(async () => {
    const resp = await fetch(`${apiBase}/v1/admin/products`, { headers: adminFetchHeaders() });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) setProducts(await resp.json());
  }, [router]);

  const loadMetrics = useCallback(async () => {
    const qs = storeFilter.trim() ? `?storeCode=${encodeURIComponent(storeFilter.trim().toUpperCase())}` : "";
    const resp = await fetch(`${apiBase}/v1/admin/metrics${qs}`, { headers: adminFetchHeaders() });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) setMetrics(await resp.json());
  }, [router, storeFilter]);

  const loadDiscounts = useCallback(async () => {
    const resp = await fetch(`${apiBase}/v1/admin/discounts`, { headers: adminFetchHeaders() });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) setDiscounts(await resp.json());
  }, [router]);

  const loadOrders = useCallback(async () => {
    const qs = new URLSearchParams({ limit: "30" });
    if (storeFilter.trim()) qs.set("storeCode", storeFilter.trim().toUpperCase());
    const resp = await fetch(`${apiBase}/v1/admin/orders?${qs.toString()}`, { headers: adminFetchHeaders() });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) setOrders(await resp.json());
  }, [router, storeFilter]);

  const loadAudit = useCallback(async () => {
    const resp = await fetch(`${apiBase}/v1/admin/audit`, { headers: adminFetchHeaders() });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) setAuditEntries(await resp.json());
  }, [router]);

  useEffect(() => {
    if (!authed) return;
    void loadProducts();
    void loadMetrics();
    void loadDiscounts();
    void loadOrders();
  }, [authed, loadProducts, loadMetrics, loadDiscounts, loadOrders]);

  function logout() {
    clearAdminToken();
    router.replace("/admin");
  }

  const isManager = adminRole === "manager";

  async function voidOrder(orderId: string) {
    if (!confirm("Void this unpaid order? It will disappear from open totals.")) return;
    const resp = await fetch(`${apiBase}/v1/admin/orders/${encodeURIComponent(orderId)}/void`, {
      method: "POST",
      headers: adminFetchHeaders(true)
    });
    if (resp.ok) {
      setMessage("Order voided.");
      await loadOrders();
      await loadMetrics();
    } else {
      const data = await resp.json().catch(() => ({}));
      setMessage((data as { message?: string }).message ?? "Void failed");
    }
  }

  async function refundOrder(orderId: string) {
    if (!confirm("Refund this paid order and put stock back on the shelf?")) return;
    const resp = await fetch(`${apiBase}/v1/admin/orders/${encodeURIComponent(orderId)}/refund`, {
      method: "POST",
      headers: adminFetchHeaders(true)
    });
    if (resp.ok) {
      setMessage("Refund recorded.");
      await loadOrders();
      await loadMetrics();
      await loadProducts();
    } else {
      const data = await resp.json().catch(() => ({}));
      setMessage((data as { message?: string }).message ?? "Refund failed");
    }
  }

  async function sendReceipt(orderId: string) {
    const to = window.prompt("Email or phone for receipt webhook");
    if (!to?.trim()) return;
    const channel = to.includes("@") ? "email" : "sms";
    const resp = await fetch(`${apiBase}/v1/admin/orders/${encodeURIComponent(orderId)}/receipt-send`, {
      method: "POST",
      headers: adminFetchHeaders(true),
      body: JSON.stringify({ channel, to: to.trim() })
    });
    const data = await resp.json().catch(() => ({}));
    setMessage((data as { message?: string; detail?: string }).detail ?? (resp.ok ? "Receipt queued" : "Send failed"));
  }

  async function downloadOrdersCsv() {
    const qs = storeFilter.trim() ? `?storeCode=${encodeURIComponent(storeFilter.trim().toUpperCase())}` : "";
    const resp = await fetch(`${apiBase}/v1/admin/export/orders.csv${qs}`, { headers: adminFetchHeaders() });
    if (!resp.ok) {
      setMessage("CSV export failed (manager only for orders).");
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadProductsCsv() {
    const resp = await fetch(`${apiBase}/v1/admin/export/products.csv`, { headers: adminFetchHeaders() });
    if (!resp.ok) {
      setMessage("CSV export failed.");
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function uploadProductImage(file: File, onUrl?: (url: string) => void) {
    if (!file.type.startsWith("image/")) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    setImageUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const resp = await fetch(`${apiBase}/v1/admin/upload/product-image`, {
        method: "POST",
        headers: adminFetchHeaders(true),
        body: JSON.stringify({ dataUrl })
      });
      const data = (await resp.json()) as { url?: string; message?: string };
      if (!resp.ok || !data.url) {
        setMessage(data.message ?? "Image upload failed");
        return;
      }
      if (onUrl) onUrl(data.url);
      else setImageUrl(data.url);
      setMessage("Image uploaded.");
    } catch {
      setMessage("Could not upload image.");
    }
    setImageUploading(false);
  }

  async function saveProductImage(productId: string, url: string) {
    const resp = await fetch(`${apiBase}/v1/admin/products/${productId}/image`, {
      method: "PATCH",
      headers: adminFetchHeaders(true),
      body: JSON.stringify({ imageUrl: url })
    });
    if (resp.ok) {
      setMessage("Product image updated.");
      await loadProducts();
    } else {
      const data = await resp.json().catch(() => ({}));
      setMessage((data as { message?: string }).message ?? "Could not save image.");
    }
  }

  async function addProduct() {
    const errors = validateProductForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage("Fix the highlighted fields before saving.");
      return;
    }

    setLoading(true);
    setMessage("");
    const resp = await fetch(`${apiBase}/v1/admin/products`, {
      method: "POST",
      headers: adminFetchHeaders(true),
      body: JSON.stringify({
        barcode: barcode.trim(),
        name: name.trim(),
        category: category.trim(),
        unitPrice: Number(sellingPrice),
        costPrice: Number(costPrice),
        taxPercent: Number(taxPercent),
        inStock: Number(inStock),
        demandScore: Number(demandScore),
        imageUrl: imageUrl.trim() || undefined
      })
    });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      setLoading(false);
      return;
    }
    if (resp.ok) {
      setMessage("Product added to catalogue.");
      resetProductForm();
      await loadProducts();
      await loadMetrics();
    } else {
      const data = await resp.json().catch(() => ({}));
      const errMsg = (data as { message?: string }).message ?? "Unable to add product";
      setMessage(errMsg);
      if (resp.status === 409 || errMsg.toLowerCase().includes("barcode")) {
        setFormErrors((prev) => ({ ...prev, barcode: errMsg }));
      }
    }
    setLoading(false);
  }

  async function saveStock(productId: string, next: number) {
    setStockModalBusy(true);
    const resp = await fetch(`${apiBase}/v1/admin/products/${productId}/inventory`, {
      method: "PATCH",
      headers: adminFetchHeaders(true),
      body: JSON.stringify({ inStock: next })
    });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      setStockModalBusy(false);
      return;
    }
    if (resp.ok) {
      setMessage("Stock updated.");
      setStockModalProduct(null);
      await loadProducts();
      await loadMetrics();
    } else {
      const data = await resp.json().catch(() => ({}));
      setMessage((data as { message?: string }).message ?? "Could not update stock.");
    }
    setStockModalBusy(false);
  }

  function openStockModal(product: AdminProduct) {
    setStockModalProduct({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      inStock: product.inStock
    });
  }

  async function applyDiscount() {
    if (!discountProductId) {
      setMessage("Select a product for the discount.");
      return;
    }
    setMessage("");
    const resp = await fetch(`${apiBase}/v1/admin/discounts`, {
      method: "POST",
      headers: adminFetchHeaders(true),
      body: JSON.stringify({ productId: discountProductId, discountPercent: Number(discountPct) })
    });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) {
      setMessage("Discount applied.");
      await loadProducts();
      await loadDiscounts();
      await loadMetrics();
    } else {
      const data = await resp.json().catch(() => ({}));
      setMessage((data as { message?: string }).message ?? "Could not apply discount");
    }
  }

  async function removeDiscount(productId: string) {
    const resp = await fetch(`${apiBase}/v1/admin/discounts/${encodeURIComponent(productId)}`, {
      method: "DELETE",
      headers: adminFetchHeaders()
    });
    if (resp.ok) {
      setMessage("Discount removed.");
      await loadProducts();
      await loadDiscounts();
      await loadMetrics();
    }
  }

  if (!authChecked || !authed) {
    return (
      <div className="adminShell">
        <main className="adminMain">
          <p className="muted" style={{ padding: "28px 0" }}>
            {authChecked ? "Redirecting to sign in…" : "Loading dashboard…"}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="adminShell">
      <main className="adminMain">
        <header className="adminHeader">
          <div>
            <p className="adminHeader__eyebrow">ZippMart HQ</p>
            <h1 className="adminHeader__title">Operations dashboard</h1>
            <p className="adminHeader__sub">Catalogue economics, promotions, and store KPIs.</p>
          </div>
          <div className="adminHeader__actions">
            <select
              className="adminSelect adminSelect--store"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              aria-label="Filter metrics and orders by store"
            >
              <option value="">All stores</option>
              <option value="BLR001">BLR001</option>
              <option value="DEL001">DEL001</option>
              <option value="MUM001">MUM001</option>
            </select>
            <button type="button" className="adminBtn adminBtn--ghost" onClick={() => void downloadProductsCsv()}>
              Products CSV
            </button>
            {isManager ? (
              <>
                <button type="button" className="adminBtn adminBtn--ghost" onClick={() => void downloadOrdersCsv()}>
                  Orders CSV
                </button>
                <button type="button" className="adminBtn adminBtn--ghost" onClick={() => void loadAudit()}>
                  Audit
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="adminBtn adminBtn--ghost"
              onClick={() => {
                void loadMetrics();
                void loadProducts();
                void loadDiscounts();
                void loadOrders();
              }}
            >
              Refresh
            </button>
            <button type="button" className="adminBtn adminBtn--ghost adminBtn--logout" onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        {metrics ? (
          <section className="metricsGrid" aria-label="Store KPIs">
            <div className="metricCard">
              <p className="metricCard__label">Paid orders</p>
              <p className="metricCard__value">{metrics.paidOrderCount}</p>
              <p className="metricCard__hint">All time (this server)</p>
            </div>
            <div className="metricCard metricCard--accent">
              <p className="metricCard__label">Net revenue</p>
              <p className="metricCard__value">{money(metrics.totalRevenue)}</p>
              <p className="metricCard__hint">Completed payments</p>
            </div>
            <div className="metricCard">
              <p className="metricCard__label">Open orders</p>
              <p className="metricCard__value">{metrics.openOrderCount}</p>
              <p className="metricCard__hint">{money(metrics.pendingOrderValue)} at counter / pending</p>
            </div>
            <div className="metricCard">
              <p className="metricCard__label">Avg paid ticket</p>
              <p className="metricCard__value">{money(metrics.averagePaidOrderValue)}</p>
              <p className="metricCard__hint">Per settled order</p>
            </div>
            <div className="metricCard">
              <p className="metricCard__label">SKU count</p>
              <p className="metricCard__value">{metrics.productCount}</p>
              <p className="metricCard__hint">{metrics.lowStockSkuCount} low stock (&lt; 15 units)</p>
            </div>
            <div className="metricCard">
              <p className="metricCard__label">Inventory @ cost</p>
              <p className="metricCard__value">{money(metrics.inventoryValueAtCost)}</p>
              <p className="metricCard__hint">Stock × unit cost</p>
            </div>
            <div className="metricCard">
              <p className="metricCard__label">Inventory @ list</p>
              <p className="metricCard__value">{money(metrics.inventoryValueAtList)}</p>
              <p className="metricCard__hint">Stock × list sell</p>
            </div>
            <div className="metricCard">
              <p className="metricCard__label">Active promos</p>
              <p className="metricCard__value">{metrics.activeDiscountCount}</p>
              <p className="metricCard__hint">Discount rules live on shop</p>
            </div>
          </section>
        ) : (
          <p className="muted">Loading metrics…</p>
        )}

        {metrics && metrics.lowStockSkuCount > 0 ? (
          <div className="alertBanner" role="status">
            <strong>{metrics.lowStockSkuCount}</strong> SKU{metrics.lowStockSkuCount === 1 ? "" : "s"} below 15 units —
            use <strong>Low stock only</strong> under inventory to focus the table.
          </div>
        ) : null}

        {orders.length > 0 ? (
          <section className="panel adminPanel adminPanel--orders" aria-label="Recent orders">
            <h2 className="adminPanel__title">Recent orders</h2>
            <p className="adminPanel__lede">
              Latest checkouts on this server — filter by store above. Managers can void open orders, refund paid
              orders (restores stock), and trigger receipt webhooks.
            </p>
            <div className="tableWrap">
              <table className="adminTable adminTable--compact">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Store</th>
                    <th>Order</th>
                    <th>Token</th>
                    <th>Mode</th>
                    <th>Lines</th>
                    <th>Total</th>
                    <th>Status</th>
                    {isManager ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="muted">{new Date(o.createdAt).toLocaleString()}</td>
                      <td className="mono">{o.storeCode ?? "—"}</td>
                      <td className="mono" title={o.orderId}>
                        {o.orderId.slice(0, 8)}…
                      </td>
                      <td>{o.tokenNumber != null ? `#${o.tokenNumber}` : "—"}</td>
                      <td>{o.paymentMode}</td>
                      <td>{o.lineCount}</td>
                      <td>{money(o.grandTotal)}</td>
                      <td>
                        {o.voided ? <span className="pillWarn">Void</span> : null}
                        {o.refunded ? <span className="pillWarn">Refunded</span> : null}
                        {!o.voided && !o.refunded ? (
                          o.paid ? (
                            <span className="pillOk">Paid</span>
                          ) : (
                            <span className="pillWarn">Open</span>
                          )
                        ) : null}
                      </td>
                      {isManager ? (
                        <td>
                          <div className="orderActions">
                            {!o.paid && !o.voided && !o.refunded ? (
                              <button
                                type="button"
                                className="adminBtn adminBtn--small"
                                onClick={() => void voidOrder(o.orderId)}
                              >
                                Void
                              </button>
                            ) : null}
                            {o.paid && !o.refunded && !o.voided ? (
                              <button
                                type="button"
                                className="adminBtn adminBtn--small"
                                onClick={() => void refundOrder(o.orderId)}
                              >
                                Refund
                              </button>
                            ) : null}
                            {o.paid && !o.refunded ? (
                              <button
                                type="button"
                                className="adminBtn adminBtn--small"
                                onClick={() => void sendReceipt(o.orderId)}
                              >
                                Receipt
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {isManager && auditEntries.length > 0 ? (
          <section className="panel adminPanel" aria-label="Audit log">
            <h2 className="adminPanel__title">Audit log</h2>
            <p className="adminPanel__lede">Last security and inventory events (newest first).</p>
            <div className="tableWrap">
              <table className="adminTable adminTable--compact">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((a) => (
                    <tr key={a.id}>
                      <td className="muted">{new Date(a.at).toLocaleString()}</td>
                      <td>{a.actor}</td>
                      <td>{a.role}</td>
                      <td className="mono">{a.action}</td>
                      <td className="muted">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {products.length === 0 && !loading ? (
          <div className="alertBanner" role="status">
            Your catalogue is empty. Use <strong>Add product</strong> on the left to create your first SKU — customers will see it on the shop once saved.
          </div>
        ) : null}

        <div className="adminWorkspace">
          <div className="adminWorkspace__left">
            <section className="panel adminPanel adminPanel--add">
              <h2 className="adminPanel__title">Add product</h2>
              <p className="adminPanel__lede">
                Landed cost vs list shelf price. Scan barcodes with the camera or a USB scanner.
              </p>

              {barcodeConflict ? (
                <p className="formAlert formAlert--warn" role="status">
                  Barcode <strong className="mono">{barcodeConflict.barcode}</strong> already belongs to{" "}
                  <strong>{barcodeConflict.name}</strong> — use a different code or adjust stock in the inventory table.
                </p>
              ) : null}

              <div className="formGrid formGrid--paired">
                <label className={`field field--full${formErrors.barcode ? " field--invalid" : ""}`}>
                  <span>Barcode</span>
                  <div className="barcodeRow">
                    <input
                      value={barcode}
                      onChange={(e) => handleBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          nameInputRef.current?.focus();
                        }
                      }}
                      placeholder="EAN / UPC / internal SKU"
                      autoComplete="off"
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      className="adminBtn adminBtn--ghost adminBtn--small"
                      onClick={() => setCameraOn((v) => !v)}
                      aria-pressed={cameraOn}
                    >
                      {cameraOn ? "Hide camera" : "Scan"}
                    </button>
                  </div>
                  {formErrors.barcode ? <p className="fieldError">{formErrors.barcode}</p> : null}
                </label>

                <div className="field--full">
                  <BarcodeCameraScanner
                    active={cameraOn}
                    onClose={() => setCameraOn(false)}
                    onDecoded={handleBarcodeDecoded}
                  />
                </div>

                <label className={`field${formErrors.name ? " field--invalid" : ""}`}>
                  <span>Product name</span>
                  <input ref={nameInputRef} value={name} onChange={(e) => { setName(e.target.value); setFormErrors((p) => ({ ...p, name: undefined })); }} placeholder="e.g. Basmati Rice 5kg" />
                  {formErrors.name ? <p className="fieldError">{formErrors.name}</p> : null}
                </label>

                <label className={`field${formErrors.category ? " field--invalid" : ""}`}>
                  <span>Category</span>
                  <select value={category} onChange={(e) => { setCategory(e.target.value); setFormErrors((p) => ({ ...p, category: undefined })); }}>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {formErrors.category ? <p className="fieldError">{formErrors.category}</p> : null}
                </label>

                <div className="field field--full imageField">
                  <span>Product image</span>
                  <div className="imageField__row">
                    <div className="imageField__preview" aria-hidden={!imageUrl}>
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="imageField__img" />
                      ) : (
                        <span className="imageField__placeholder">No image</span>
                      )}
                    </div>
                    <div className="imageField__controls">
                      <input
                        className="adminInput"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="Image URL or upload a file"
                      />
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="srOnly"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void uploadProductImage(file);
                        }}
                      />
                      <button
                        type="button"
                        className="adminBtn adminBtn--ghost adminBtn--small"
                        disabled={imageUploading || loading}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        {imageUploading ? "Uploading…" : "Upload file"}
                      </button>
                    </div>
                  </div>
                  <p className="formNote">Shown on the customer shop. Upload saves to the API server, or paste any HTTPS image link.</p>
                </div>

                <label className={`field${formErrors.costPrice ? " field--invalid" : ""}`}>
                  <span>Unit cost (₹)</span>
                  <input inputMode="decimal" value={costPrice} onChange={(e) => { setCostPrice(e.target.value); setFormErrors((p) => ({ ...p, costPrice: undefined, sellingPrice: undefined })); }} placeholder="e.g. 120" />
                  {formErrors.costPrice ? <p className="fieldError">{formErrors.costPrice}</p> : null}
                </label>

                <label className={`field${formErrors.sellingPrice ? " field--invalid" : ""}`}>
                  <span>List selling price (₹)</span>
                  <input inputMode="decimal" value={sellingPrice} onChange={(e) => { setSellingPrice(e.target.value); setFormErrors((p) => ({ ...p, sellingPrice: undefined })); }} placeholder="e.g. 189" />
                  {formErrors.sellingPrice ? <p className="fieldError">{formErrors.sellingPrice}</p> : null}
                </label>

                <div className="field--pair">
                  <label className={`field${formErrors.taxPercent ? " field--invalid" : ""}`}>
                    <span>Tax %</span>
                    <input inputMode="decimal" value={taxPercent} onChange={(e) => { setTaxPercent(e.target.value); setFormErrors((p) => ({ ...p, taxPercent: undefined })); }} />
                    {formErrors.taxPercent ? <p className="fieldError">{formErrors.taxPercent}</p> : null}
                  </label>
                  <label className={`field${formErrors.inStock ? " field--invalid" : ""}`}>
                    <span>Quantity on hand</span>
                    <input inputMode="numeric" value={inStock} onChange={(e) => { setInStock(e.target.value); setFormErrors((p) => ({ ...p, inStock: undefined })); }} placeholder="0" />
                    {formErrors.inStock ? <p className="fieldError">{formErrors.inStock}</p> : null}
                  </label>
                </div>

                <label className={`field${formErrors.demandScore ? " field--invalid" : ""}`}>
                  <span>Demand score (0–100)</span>
                  <input inputMode="numeric" value={demandScore} onChange={(e) => { setDemandScore(e.target.value); setFormErrors((p) => ({ ...p, demandScore: undefined })); }} placeholder="Higher = featured in shop" />
                  {formErrors.demandScore ? <p className="fieldError">{formErrors.demandScore}</p> : null}
                </label>
              </div>

              {formProfit != null ? (
                <p className="profitHint">
                  Est. profit / unit at list: <strong>{money(formProfit)}</strong>
                  {Number(taxPercent) > 0 ? (
                    <> · shelf price incl. {taxPercent}% tax: <strong>{money(Math.round(Number(sellingPrice) * (1 + Number(taxPercent) / 100) * 100) / 100)}</strong></>
                  ) : null}
                </p>
              ) : null}

              <div className="formActions">
                <button
                  type="button"
                  className="adminBtn"
                  disabled={loading || !!barcodeConflict}
                  onClick={() => void addProduct()}
                >
                  {loading ? "Saving…" : "Save product"}
                </button>
                <button type="button" className="adminBtn adminBtn--ghost" disabled={loading} onClick={resetProductForm}>
                  Clear form
                </button>
                <p className="formNote">Required: barcode, name, category, unit cost, and selling price. Stock can be zero for catalogue-only SKUs.</p>
              </div>
            </section>
          </div>

          <div className="adminWorkspace__right">
            <section className="panel adminPanel adminWorkspace__inventory">
            <h2 className="adminPanel__title">Inventory &amp; economics</h2>
            <div className="invToolbar">
              <label className="invSearch">
                <span className="srOnly">Filter products</span>
                <input
                  type="search"
                  placeholder="Filter by name, barcode, category…"
                  value={invFilter}
                  onChange={(e) => setInvFilter(e.target.value)}
                />
              </label>
              <button type="button" className="adminBtn adminBtn--small" onClick={() => setInvFilter("")}>
                Clear search
              </button>
              <button
                type="button"
                className={`adminBtn adminBtn--small${lowStockOnlyView ? " adminBtn--on" : ""}`}
                onClick={() => setLowStockOnlyView((v) => !v)}
              >
                Low stock only ({lowStockCount})
              </button>
            </div>
            <div className="tableWrap">
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Barcode</th>
                    <th>Cost</th>
                    <th>List</th>
                    <th>Promo</th>
                    <th>Shelf</th>
                    <th>Profit / unit</th>
                    <th>Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="muted" style={{ padding: "20px 14px" }}>
                        No products match this filter. Clear search or turn off low-stock-only.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.id} className={p.discountPercent > 0 ? "adminTable__row--hot" : undefined}>
                        <td>
                          <div className="invProductCell">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="invProductCell__thumb" />
                            ) : (
                              <span className="invProductCell__thumb invProductCell__thumb--empty" aria-hidden />
                            )}
                            <div>
                              <strong>{p.name}</strong>
                              <div className="muted">{p.category}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{p.barcode}</td>
                        <td>{money(p.costPrice)}</td>
                        <td>{money(p.unitPrice)}</td>
                        <td>{p.discountPercent > 0 ? <span className="pillHot">{p.discountPercent}%</span> : "—"}</td>
                        <td>{money(p.effectiveUnitPrice)}</td>
                        <td>{money(p.profitPerUnitAtSale)}</td>
                        <td>
                          <span
                            className={
                              p.inStock === 0 ? "stockCell stockCell--out" : p.inStock < 15 ? "stockCell stockCell--low" : "stockCell"
                            }
                          >
                            {p.inStock}
                          </span>
                        </td>
                        <td>
                          <div className="invRowActions">
                            <button type="button" className="adminBtn adminBtn--small" onClick={() => openStockModal(p)}>
                              Set stock
                            </button>
                            <button
                              type="button"
                              className="adminBtn adminBtn--small adminBtn--ghost"
                              onClick={() => {
                                setImageTargetId(p.id);
                                inventoryImageInputRef.current?.click();
                              }}
                            >
                              Image
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

            <section className="panel adminPanel adminPanel--promo">
              <h2 className="adminPanel__title">Discounts</h2>
              <p className="adminPanel__lede">Percentage off list price for the customer shop. Max 90%. Removes instantly when deleted.</p>
              <div className="promoRow">
                <select className="adminSelect" value={discountProductId} onChange={(e) => setDiscountProductId(e.target.value)}>
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.barcode})
                    </option>
                  ))}
                </select>
                <input
                  className="adminPct"
                  inputMode="numeric"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  aria-label="Discount percent"
                />
                <span className="pctSuffix">%</span>
                <button type="button" className="adminBtn" onClick={() => void applyDiscount()}>
                  Apply
                </button>
              </div>
              <div className="discountList">
                {discounts.length === 0 ? <p className="emptyHint">No active discounts.</p> : null}
                {discounts.map((d) => (
                  <div key={d.productId} className="discountRow">
                    <div>
                      <strong>{d.name}</strong>
                      <div className="muted">
                        {d.discountPercent}% off · list {money(d.listPrice)} → sale {money(d.effectiveUnitPrice)}
                      </div>
                      <div className="muted">
                        Profit / unit: list {money(d.profitPerUnitAtList)} · after discount {money(d.profitPerUnitAtSale)}
                      </div>
                    </div>
                    <button type="button" className="adminBtn adminBtn--danger" onClick={() => void removeDiscount(d.productId)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {message ? <div className="adminToast">{message}</div> : null}

        <StockAdjustModal
          product={stockModalProduct}
          busy={stockModalBusy}
          onClose={() => {
            if (!stockModalBusy) setStockModalProduct(null);
          }}
          onSave={(next) => {
            if (stockModalProduct) void saveStock(stockModalProduct.id, next);
          }}
        />

        <input
          ref={inventoryImageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="srOnly"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const targetId = imageTargetId;
            e.target.value = "";
            setImageTargetId(null);
            if (!file || !targetId) return;
            void uploadProductImage(file, (url) => void saveProductImage(targetId, url));
          }}
        />
      </main>
    </div>
  );
}
