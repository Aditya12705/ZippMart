"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNav, type AdminSection } from "../../components/AdminNav";
import { OverviewSection } from "../../components/admin/OverviewSection";
import { BarcodeCameraScanner } from "../../components/BarcodeCameraScanner";
import { OrderReceiptModal } from "../../components/OrderReceiptModal";
import { StockAdjustModal } from "../../components/StockAdjustModal";
import type { PaidReceipt } from "../../../lib/receipt";
import { adminFetchHeaders, clearAdminToken, getAdminRole, getAdminToken } from "../../../lib/adminAuth";
import {
  APPAREL_CATEGORIES,
  APPAREL_COLORS,
  APPAREL_GENDERS,
  APPAREL_SEASONS,
  APPAREL_SIZES,
  BRAND_NAME
} from "../../../lib/apparel";

import { apiBase } from "../../../lib/api";

const CATEGORY_OPTIONS = APPAREL_CATEGORIES;

type FormErrors = Partial<Record<"barcode" | "name" | "category" | "costPrice" | "sellingPrice" | "taxPercent" | "inStock" | "demandScore" | "reorderLevel", string>>;

type AdminProduct = {
  id: string;
  name: string;
  barcode: string;
  sku: string;
  category: string;
  styleCode: string;
  size: string;
  color: string;
  brand: string;
  season: string;
  gender: string;
  unitPrice: number;
  costPrice: number;
  taxPercent: number;
  inStock: number;
  reservedQty: number;
  availableQty: number;
  reorderLevel: number;
  demandScore: number;
  imageUrl?: string | null;
  discountPercent: number;
  effectiveUnitPrice: number;
  profitPerUnitAtList: number;
  profitPerUnitAtSale: number;
};

type StockMovementRow = {
  id: string;
  productId: string;
  productName?: string;
  barcode?: string;
  delta: number;
  qtyAfter: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  actor: string;
  note: string;
  createdAt: string;
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
  reservedUnitsTotal?: number;
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

const CODE39_MAP: Record<string, string> = {
  "0": "101001101101",
  "1": "110100101011",
  "2": "101100101011",
  "3": "110110010101",
  "4": "101001101011",
  "5": "110100110101",
  "6": "101100110101",
  "7": "101001011011",
  "8": "110100101101",
  "9": "101100101101",
  "A": "110101001011",
  "B": "101101001011",
  "C": "110110100101",
  "D": "101011001011",
  "E": "110101100101",
  "F": "101101100101",
  "G": "101010011011",
  "H": "110101001101",
  "I": "101101001101",
  "J": "101011001101",
  "K": "110101010011",
  "L": "101101010011",
  "M": "110110101001",
  "N": "101011010011",
  "O": "110101101001",
  "P": "101101101001",
  "Q": "101010110011",
  "R": "110101011001",
  "S": "101101011001",
  "T": "101011011001",
  "U": "110010101011",
  "V": "100110101011",
  "W": "110011010101",
  "X": "100101101011",
  "Y": "110010110101",
  "Z": "100110110101",
  "-": "100101011011",
  ".": "110010101101",
  " ": "100110101101",
  "$": "100100100101",
  "/": "100100101001",
  "+": "100101001001",
  "%": "100100101001",
  "*": "100101101101"
};

function encodeCode39(text: string) {
  const chars = ("*" + text + "*").toUpperCase();
  let bits = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = CODE39_MAP[ch] || CODE39_MAP[" "];
    bits += code + "0";
  }
  return bits;
}

function BarcodeSVG({ value }: { value: string }) {
  const bits = useMemo(() => {
    const clean = value.replace(/[^A-Z0-9\-.\s$/+%]/gi, "");
    return encodeCode39(clean || "0000");
  }, [value]);

  const barWidth = 2;
  const height = 50;
  const width = bits.length * barWidth;

  return (
    <svg width={width + 20} height={height + 25} viewBox={`0 0 ${width + 20} ${height + 25}`} style={{ background: "white", padding: "10px" }}>
      <g transform="translate(10, 0)">
        {bits.split("").map((bit, idx) => {
          if (bit === "1") {
            return (
              <rect
                key={idx}
                x={idx * barWidth}
                y={0}
                width={barWidth}
                height={height}
                fill="black"
              />
            );
          }
          return null;
        })}
        <text
          x={width / 2}
          y={height + 14}
          textAnchor="middle"
          fill="black"
          style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: "bold" }}
        >
          {value.toUpperCase()}
        </text>
      </g>
    </svg>
  );
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
  const [styleCode, setStyleCode] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [season, setSeason] = useState("");
  const [gender, setGender] = useState("Unisex");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [marginPct, setMarginPct] = useState("");
  const [markupPct, setMarkupPct] = useState("");
  const [reorderLevel, setReorderLevel] = useState("10");
  const [printTagProduct, setPrintTagProduct] = useState<AdminProduct | null>(null);
  const [taxPercent, setTaxPercent] = useState("5");
  const [inStock, setInStock] = useState("0");
  const [demandScore, setDemandScore] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
  const [sizeFilter, setSizeFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [lowStockOnlyView, setLowStockOnlyView] = useState(false);
  const [storeFilter, setStoreFilter] = useState("");
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditRow[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<PaidReceipt | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [stockModalProduct, setStockModalProduct] = useState<
    Pick<AdminProduct, "id" | "name" | "barcode" | "inStock" | "reservedQty" | "availableQty"> | null
  >(null);
  const [stockModalBusy, setStockModalBusy] = useState(false);
  const [stockMovements, setStockMovements] = useState<StockMovementRow[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  const formProfit = useMemo(() => {
    const sell = Number(sellingPrice);
    const cost = Number(costPrice);
    if (!Number.isFinite(sell) || !Number.isFinite(cost) || sell <= 0) return null;
    return Math.round((sell - cost) * 100) / 100;
  }, [sellingPrice, costPrice]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (lowStockOnlyView) {
      list = list.filter((p) => p.availableQty < p.reorderLevel);
    }
    if (sizeFilter) {
      list = list.filter((p) => p.size === sizeFilter);
    }
    if (colorFilter) {
      list = list.filter((p) => p.color === colorFilter);
    }
    const t = invFilter.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(t) ||
        p.barcode.toLowerCase().includes(t) ||
        p.sku.toLowerCase().includes(t) ||
        p.category.toLowerCase().includes(t) ||
        p.styleCode.toLowerCase().includes(t) ||
        p.size.toLowerCase().includes(t) ||
        p.color.toLowerCase().includes(t) ||
        p.brand.toLowerCase().includes(t)
    );
  }, [products, invFilter, lowStockOnlyView, sizeFilter, colorFilter]);

  const lowStockCount = useMemo(() => products.filter((p) => p.availableQty < p.reorderLevel).length, [products]);

  const sizeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      if (p.size?.trim()) s.add(p.size.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const colorOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      if (p.color?.trim()) s.add(p.color.trim());
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const handleCostChange = (val: string) => {
    setCostPrice(val);
    setFormErrors((p) => ({ ...p, costPrice: undefined, sellingPrice: undefined }));
    const c = Number(val);
    if (!Number.isFinite(c) || c <= 0) return;
    
    const s = Number(sellingPrice);
    if (Number.isFinite(s) && s > 0) {
      const margin = ((s - c) / s) * 100;
      const markup = ((s - c) / c) * 100;
      setMarginPct(margin.toFixed(1));
      setMarkupPct(markup.toFixed(1));
    } else if (marginPct) {
      const m = Number(marginPct);
      if (m < 100) {
        const calculatedSell = c / (1 - m / 100);
        setSellingPrice(calculatedSell.toFixed(2));
        setMarkupPct(((calculatedSell - c) / c * 100).toFixed(1));
      }
    } else if (markupPct) {
      const mk = Number(markupPct);
      const calculatedSell = c * (1 + mk / 100);
      setSellingPrice(calculatedSell.toFixed(2));
      setMarginPct(((calculatedSell - c) / calculatedSell * 100).toFixed(1));
    }
  };

  const handleSellingChange = (val: string) => {
    setSellingPrice(val);
    setFormErrors((p) => ({ ...p, sellingPrice: undefined }));
    const s = Number(val);
    if (!Number.isFinite(s) || s <= 0) return;

    const c = Number(costPrice);
    if (Number.isFinite(c) && c > 0) {
      const margin = ((s - c) / s) * 100;
      const markup = ((s - c) / c) * 100;
      setMarginPct(margin.toFixed(1));
      setMarkupPct(markup.toFixed(1));
    } else if (marginPct) {
      const m = Number(marginPct);
      const calculatedCost = s * (1 - m / 100);
      setCostPrice(calculatedCost.toFixed(2));
      setMarkupPct(((s - calculatedCost) / calculatedCost * 100).toFixed(1));
    } else if (markupPct) {
      const mk = Number(markupPct);
      const calculatedCost = s / (1 + mk / 100);
      setCostPrice(calculatedCost.toFixed(2));
      setMarginPct(((s - calculatedCost) / s * 100).toFixed(1));
    }
  };

  const handleMarginChange = (val: string) => {
    setMarginPct(val);
    const m = Number(val);
    if (!Number.isFinite(m) || m >= 100) return;

    const c = Number(costPrice);
    if (Number.isFinite(c) && c > 0) {
      const calculatedSell = c / (1 - m / 100);
      setSellingPrice(calculatedSell.toFixed(2));
      setMarkupPct(((calculatedSell - c) / c * 100).toFixed(1));
    } else {
      const s = Number(sellingPrice);
      if (Number.isFinite(s) && s > 0) {
        const calculatedCost = s * (1 - m / 100);
        setCostPrice(calculatedCost.toFixed(2));
        setMarkupPct(((s - calculatedCost) / calculatedCost * 100).toFixed(1));
      }
    }
  };

  const handleMarkupChange = (val: string) => {
    setMarkupPct(val);
    const mk = Number(val);
    if (!Number.isFinite(mk) || mk <= -100) return;

    const c = Number(costPrice);
    if (Number.isFinite(c) && c > 0) {
      const calculatedSell = c * (1 + mk / 100);
      setSellingPrice(calculatedSell.toFixed(2));
      setMarginPct(((calculatedSell - c) / calculatedSell * 100).toFixed(1));
    } else {
      const s = Number(sellingPrice);
      if (Number.isFinite(s) && s > 0) {
        const calculatedCost = s / (1 + mk / 100);
        setCostPrice(calculatedCost.toFixed(2));
        setMarginPct(((s - calculatedCost) / s * 100).toFixed(1));
      }
    }
  };

  function generateBarcode() {
    let attempts = 0;
    let code = "";
    while (attempts < 100) {
      code = "";
      for (let i = 0; i < 12; i++) {
        code += Math.floor(Math.random() * 10);
      }
      if (!products.some((p) => p.barcode === code)) {
        break;
      }
      attempts++;
    }
    handleBarcodeInput(code);
  }

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
    const reorder = Number(reorderLevel);

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
    if (!Number.isFinite(reorder) || reorder < 0 || !Number.isInteger(reorder)) errors.reorderLevel = "Reorder level must be a whole number ≥ 0.";

    return errors;
  }

  function resetProductForm() {
    setBarcode("");
    setName("");
    setCategory("General");
    setStyleCode("");
    setSize("");
    setColor("");
    setBrand("");
    setSeason("");
    setGender("Unisex");
    setCostPrice("");
    setSellingPrice("");
    setMarginPct("");
    setMarkupPct("");
    setReorderLevel("10");
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

  const loadMovements = useCallback(async () => {
    const resp = await fetch(`${apiBase}/v1/admin/inventory/movements?limit=50`, { headers: adminFetchHeaders() });
    if (resp.status === 401) {
      clearAdminToken();
      router.replace("/admin");
      return;
    }
    if (resp.ok) setStockMovements(await resp.json());
  }, [router]);

  const isManager = adminRole === "manager";

  useEffect(() => {
    if (!authed) return;
    void loadProducts();
    void loadMetrics();
    void loadDiscounts();
    void loadOrders();
  }, [authed, loadProducts, loadMetrics, loadDiscounts, loadOrders]);

  useEffect(() => {
    if (!authed || activeSection !== "audit" || !isManager) return;
    if (auditEntries.length === 0) void loadAudit();
  }, [activeSection, authed, isManager, auditEntries.length, loadAudit]);

  function onSectionChange(section: AdminSection) {
    setActiveSection(section);
    if (section === "audit" && isManager) void loadAudit();
    if (section === "inventory") void loadMovements();
  }

  function logout() {
    clearAdminToken();
    router.replace("/admin");
  }

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

  async function viewReceipt(orderId: string) {
    setReceiptOpen(true);
    setReceiptLoading(true);
    setReceiptError(null);
    setReceiptData(null);
    try {
      const resp = await fetch(`${apiBase}/v1/admin/orders/${encodeURIComponent(orderId)}/receipt`, {
        headers: adminFetchHeaders()
      });
      const data = (await resp.json().catch(() => ({}))) as PaidReceipt & { message?: string };
      if (!resp.ok) {
        setReceiptError(data.message ?? "Could not load receipt");
        return;
      }
      setReceiptData(data);
    } catch {
      setReceiptError("Could not load receipt");
    } finally {
      setReceiptLoading(false);
    }
  }

  function closeReceiptModal() {
    setReceiptOpen(false);
    setReceiptData(null);
    setReceiptError(null);
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
        styleCode: styleCode.trim(),
        size: size.trim(),
        color: color.trim(),
        brand: brand.trim(),
        season: season.trim(),
        gender: gender.trim(),
        unitPrice: Number(sellingPrice),
        costPrice: Number(costPrice),
        reorderLevel: Number(reorderLevel),
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
      await loadMovements();
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
      await loadMovements();
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
      inStock: product.inStock,
      reservedQty: product.reservedQty,
      availableQty: product.availableQty
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

  const sectionTitle =
    activeSection === "overview" ? "Operations Overview" :
    activeSection === "inventory" ? "Inventory & SKU Catalog" :
    activeSection === "orders" ? "Register Orders" :
    activeSection === "promotions" ? "Promotions & Discounts" :
    "Security Audit Log";

  const sectionSub =
    activeSection === "overview" ? "Real-time key performance indicators, low stock alerts, and revenue." :
    activeSection === "inventory" ? "Manage apparel style variations, dynamic pricing calculations, and barcode labels." :
    activeSection === "orders" ? "Review counter and customer scan-and-go transaction logs across registers." :
    activeSection === "promotions" ? "Create loyalty tier discount structures and markdown rules." :
    "Manager-only audit trail logging status changes, adjustments, and void overrides.";

  return (
    <div className="adminShell">
      <div className="adminContainer">
        <div className="adminMobileHeader">
          <div className="adminSidebar__brand">
            <span className="brandZipp">Seam</span>
            <span className="brandMart">Line</span>
          </div>
          <button
            type="button"
            className="adminMobileHeader__toggle"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileSidebarOpen ? "✕ Close" : "☰ Menu"}
          </button>
        </div>
        <aside className={`adminSidebar ${mobileSidebarOpen ? "adminSidebar--open" : ""}`}>
          <div className="adminSidebar__brand">
            <span className="brandZipp">Seam</span>
            <span className="brandMart">Line</span>
          </div>

          <div className="adminSidebar__meta">
            <div className="adminRolePill">
              {isManager ? "Manager Console" : "Staff Console"}
            </div>
            <label className="adminSidebar__label">
              <span>Active Register</span>
              <select
                className="adminSelect adminSelect--store"
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                aria-label="Filter metrics and orders by store"
              >
                <option value="">All stores</option>
                <option value="BLR001">BLR001 (Indiranagar)</option>
                <option value="DEL001">DEL001 (Connaught Place)</option>
                <option value="MUM001">MUM001 (Bandra West)</option>
              </select>
            </label>
          </div>

          <AdminNav active={activeSection} isManager={isManager} onChange={onSectionChange} />

          <div className="adminSidebar__footer">
            <button
              type="button"
              className="adminBtn adminBtn--ghost adminBtn--full"
              onClick={() => {
                void loadMetrics();
                void loadProducts();
                void loadDiscounts();
                void loadOrders();
              }}
            >
              Refresh
            </button>
            <button type="button" className="adminBtn adminBtn--ghost adminBtn--logout adminBtn--full" onClick={logout}>
              Log out
            </button>
          </div>
        </aside>

        <main className="adminMain">
          <header className="adminHeader">
            <div>
              <p className="adminHeader__eyebrow">{BRAND_NAME} HQ · {storeFilter || "Global"}</p>
              <h1 className="adminHeader__title">{sectionTitle}</h1>
              <p className="adminHeader__sub">{sectionSub}</p>
            </div>
            <div className="adminHeader__actions">
              {activeSection === "inventory" ? (
                <button type="button" className="adminBtn adminBtn--ghost" onClick={() => void downloadProductsCsv()}>
                  Products CSV
                </button>
              ) : null}
              {isManager && activeSection === "orders" ? (
                <button type="button" className="adminBtn adminBtn--ghost" onClick={() => void downloadOrdersCsv()}>
                  Orders CSV
                </button>
              ) : null}
            </div>
          </header>

          {activeSection === "overview" ? (
          <OverviewSection metrics={metrics} products={products} orders={orders} money={money} />
        ) : null}

        {activeSection === "orders" && orders.length > 0 ? (
          <section className="panel adminPanel adminPanel--orders" aria-label="Recent orders">
            <h2 className="adminPanel__title">Recent orders</h2>
            <p className="adminPanel__lede">
              Latest checkouts on this server — filter by store above. View receipts for paid orders; managers can
              void, refund, or send receipt webhooks.
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
                    <th>Actions</th>
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
                      <td>
                        <div className="orderActions">
                          {o.paid && !o.voided ? (
                            <button
                              type="button"
                              className="adminBtn adminBtn--small"
                              onClick={() => void viewReceipt(o.orderId)}
                            >
                              View receipt
                            </button>
                          ) : null}
                          {isManager && !o.paid && !o.voided && !o.refunded ? (
                            <button
                              type="button"
                              className="adminBtn adminBtn--small"
                              onClick={() => void voidOrder(o.orderId)}
                            >
                              Void
                            </button>
                          ) : null}
                          {isManager && o.paid && !o.refunded && !o.voided ? (
                            <button
                              type="button"
                              className="adminBtn adminBtn--small"
                              onClick={() => void refundOrder(o.orderId)}
                            >
                              Refund
                            </button>
                          ) : null}
                          {isManager && o.paid && !o.refunded ? (
                            <button
                              type="button"
                              className="adminBtn adminBtn--small adminBtn--ghost"
                              onClick={() => void sendReceipt(o.orderId)}
                            >
                              Send
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : activeSection === "orders" ? (
          <p className="muted adminEmptyHint">No orders yet for this store filter.</p>
        ) : null}

        {activeSection === "audit" && isManager ? (
          auditEntries.length > 0 ? (
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
          ) : (
            <p className="muted adminEmptyHint">No audit events yet. Actions like stock changes and voids appear here.</p>
          )
        ) : null}

        {activeSection === "inventory" ? (
          <>
            {metrics && metrics.lowStockSkuCount > 0 ? (
              <div className="alertBanner" role="status">
                <strong>{metrics.lowStockSkuCount}</strong> SKU{metrics.lowStockSkuCount === 1 ? "" : "s"} below 15 available units —
                use <strong>Low stock only</strong> in the table below.
                {metrics.reservedUnitsTotal ? (
                  <>
                    {" "}
                    (<strong>{metrics.reservedUnitsTotal}</strong> units held in open carts / unpaid orders.)
                  </>
                ) : null}
              </div>
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
                      onClick={generateBarcode}
                    >
                      Generate
                    </button>
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
                  <input ref={nameInputRef} value={name} onChange={(e) => { setName(e.target.value); setFormErrors((p) => ({ ...p, name: undefined })); }} placeholder="e.g. Slim Fit Oxford Shirt" />
                  {formErrors.name ? <p className="fieldError">{formErrors.name}</p> : null}
                </label>

                <label className="field">
                  <span>Style code</span>
                  <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)} placeholder="e.g. OXF-2026" />
                  <p className="formNote">Groups size/color variants of the same design.</p>
                </label>

                <label className="field">
                  <span>Brand</span>
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. SeamLine Basics" />
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

                <label className="field">
                  <span>Size</span>
                  <select value={size} onChange={(e) => setSize(e.target.value)}>
                    {APPAREL_SIZES.map((s) => (
                      <option key={s || "none"} value={s}>{s || "— select —"}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Color</span>
                  <select value={color} onChange={(e) => setColor(e.target.value)}>
                    {APPAREL_COLORS.map((c) => (
                      <option key={c || "none"} value={c}>{c || "— select —"}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Gender</span>
                  <select value={gender} onChange={(e) => setGender(e.target.value)}>
                    {APPAREL_GENDERS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Season / collection</span>
                  <select value={season} onChange={(e) => setSeason(e.target.value)}>
                    {APPAREL_SEASONS.map((s) => (
                      <option key={s || "none"} value={s}>{s || "— none —"}</option>
                    ))}
                  </select>
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
                  <p className="formNote">Shown on the customer shop. Upload saves to Supabase Storage when configured, or paste any HTTPS image link.</p>
                </div>

                <label className={`field${formErrors.costPrice ? " field--invalid" : ""}`}>
                  <span>Unit cost (₹)</span>
                  <input inputMode="decimal" value={costPrice} onChange={(e) => handleCostChange(e.target.value)} placeholder="e.g. 120" />
                  {formErrors.costPrice ? <p className="fieldError">{formErrors.costPrice}</p> : null}
                </label>

                <label className={`field${formErrors.sellingPrice ? " field--invalid" : ""}`}>
                  <span>List selling price (₹)</span>
                  <input inputMode="decimal" value={sellingPrice} onChange={(e) => handleSellingChange(e.target.value)} placeholder="e.g. 189" />
                  {formErrors.sellingPrice ? <p className="fieldError">{formErrors.sellingPrice}</p> : null}
                </label>

                <label className="field">
                  <span>Margin (%)</span>
                  <input inputMode="decimal" value={marginPct} onChange={(e) => handleMarginChange(e.target.value)} placeholder="Calculated" />
                </label>

                <label className="field">
                  <span>Markup (%)</span>
                  <input inputMode="decimal" value={markupPct} onChange={(e) => handleMarkupChange(e.target.value)} placeholder="Calculated" />
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

                <div className="field--pair">
                  <label className={`field${formErrors.reorderLevel ? " field--invalid" : ""}`}>
                    <span>Reorder alert level</span>
                    <input inputMode="numeric" value={reorderLevel} onChange={(e) => { setReorderLevel(e.target.value); setFormErrors((p) => ({ ...p, reorderLevel: undefined })); }} placeholder="10" />
                    {formErrors.reorderLevel ? <p className="fieldError">{formErrors.reorderLevel}</p> : null}
                  </label>
                  <label className={`field${formErrors.demandScore ? " field--invalid" : ""}`}>
                    <span>Demand score (0–100)</span>
                    <input inputMode="numeric" value={demandScore} onChange={(e) => { setDemandScore(e.target.value); setFormErrors((p) => ({ ...p, demandScore: undefined })); }} placeholder="Higher = featured in shop" />
                    {formErrors.demandScore ? <p className="fieldError">{formErrors.demandScore}</p> : null}
                  </label>
                </div>
              </div>

              {formProfit != null ? (
                <p className="profitHint">
                  Est. profit / unit at list: <strong>{money(formProfit)}</strong>
                  {marginPct ? <> · margin: <strong>{marginPct}%</strong></> : null}
                  {markupPct ? <> · markup: <strong>{markupPct}%</strong></> : null}
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
                <p className="formNote">Each size/color is a separate SKU with its own hang-tag barcode. SKU auto-generates as STYLE-COLOR-SIZE.</p>
              </div>
            </section>
          </div>

          <div className="adminWorkspace__right">
            <section className="panel adminPanel adminWorkspace__inventory">
            <h2 className="adminPanel__title">Variant inventory &amp; economics</h2>
            <div className="invToolbar">
              <label className="invSearch">
                <span className="srOnly">Filter products</span>
                <input
                  type="search"
                  placeholder="Filter by name, style, SKU, barcode…"
                  value={invFilter}
                  onChange={(e) => setInvFilter(e.target.value)}
                />
              </label>
              <label className="invSearch">
                <span className="srOnly">Filter by size</span>
                <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} aria-label="Filter by size">
                  <option value="">All sizes</option>
                  {sizeOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="invSearch">
                <span className="srOnly">Filter by color</span>
                <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} aria-label="Filter by color">
                  <option value="">All colors</option>
                  {colorOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
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
            <div className="adminDesktopTable">
              <div className="tableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th>SKU / Barcode</th>
                      <th>Cost</th>
                      <th>List</th>
                      <th>Promo</th>
                      <th>Shelf</th>
                      <th>Profit / unit</th>
                      <th>On hand</th>
                      <th>Reserved</th>
                      <th>Available</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="muted" style={{ padding: "20px 14px" }}>
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
                                <div className="muted">
                                  {[p.styleCode, p.size, p.color, p.category].filter(Boolean).join(" · ")}
                                </div>
                                {p.brand ? <div className="muted">{p.brand}{p.season ? ` · ${p.season}` : ""}</div> : null}
                              </div>
                            </div>
                          </td>
                          <td className="mono">
                            <div>{p.sku || "—"}</div>
                            <div className="muted">{p.barcode}</div>
                          </td>
                          <td>{money(p.costPrice)}</td>
                          <td>{money(p.unitPrice)}</td>
                          <td>{p.discountPercent > 0 ? <span className="pillHot">{p.discountPercent}%</span> : "—"}</td>
                          <td>{money(p.effectiveUnitPrice)}</td>
                          <td>{money(p.profitPerUnitAtSale)}</td>
                          <td>{p.inStock}</td>
                          <td>{p.reservedQty > 0 ? <span className="textWarn">{p.reservedQty}</span> : "0"}</td>
                          <td>
                            <span
                              className={
                                p.availableQty === 0
                                  ? "stockCell stockCell--out"
                                  : p.availableQty < 5
                                    ? "stockCell stockCell--low"
                                    : "stockCell"
                              }
                            >
                              {p.availableQty}
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
                              <button
                                type="button"
                                className="adminBtn adminBtn--small adminBtn--ghost"
                                onClick={() => setPrintTagProduct(p)}
                              >
                                Print Tag
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="adminMobileCards">
              {filteredProducts.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "28px 12px", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
                  No products match this filter. Clear search or turn off low-stock-only.
                </p>
              ) : (
                filteredProducts.map((p) => (
                  <div key={p.id} className={`adminInvCard ${p.discountPercent > 0 ? "adminInvCard--hot" : ""}`}>
                    <div className="adminInvCard__header">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="adminInvCard__thumb" />
                      ) : (
                        <span className="adminInvCard__thumb adminInvCard__thumb--empty" aria-hidden />
                      )}
                      <div className="adminInvCard__titleSection">
                        <h4 className="adminInvCard__name">{p.name}</h4>
                        <div className="adminInvCard__sub">{[p.styleCode, p.size, p.color, p.category].filter(Boolean).join(" · ")}</div>
                        {p.brand ? <div className="adminInvCard__brand">{p.brand}{p.season ? ` · ${p.season}` : ""}</div> : null}
                      </div>
                    </div>
                    
                    <div className="adminInvCard__body">
                      <div className="adminInvCard__details">
                        <div className="adminInvCard__row"><strong>SKU:</strong> <span className="mono">{p.sku || "—"}</span></div>
                        <div className="adminInvCard__row"><strong>Barcode:</strong> <span className="mono">{p.barcode}</span></div>
                        <div className="adminInvCard__row"><strong>Cost:</strong> {money(p.costPrice)}</div>
                        <div className="adminInvCard__row"><strong>List Price:</strong> {money(p.unitPrice)}</div>
                        <div className="adminInvCard__row"><strong>Promo:</strong> {p.discountPercent > 0 ? <span className="pillHot">{p.discountPercent}%</span> : "—"}</div>
                        <div className="adminInvCard__row"><strong>Shelf Price:</strong> {money(p.effectiveUnitPrice)}</div>
                        <div className="adminInvCard__row"><strong>Profit/unit:</strong> {money(p.profitPerUnitAtSale)}</div>
                      </div>
                      
                      <div className="adminInvCard__stock">
                        <div className="adminInvCard__stockItem">
                          <span className="adminInvCard__stockLabel">On Hand</span>
                          <span className="adminInvCard__stockValue">{p.inStock}</span>
                        </div>
                        <div className="adminInvCard__stockItem">
                          <span className="adminInvCard__stockLabel">Reserved</span>
                          <span className="adminInvCard__stockValue">{p.reservedQty > 0 ? <span className="textWarn">{p.reservedQty}</span> : "0"}</span>
                        </div>
                        <div className="adminInvCard__stockItem">
                          <span className="adminInvCard__stockLabel">Available</span>
                          <span className={`adminInvCard__stockValue ${p.availableQty === 0 ? "stockCell--out" : p.availableQty < 5 ? "stockCell--low" : ""}`}>
                            {p.availableQty}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="adminInvCard__actions">
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
                      <button
                        type="button"
                        className="adminBtn adminBtn--small adminBtn--ghost"
                        onClick={() => setPrintTagProduct(p)}
                      >
                        Print Tag
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <section className="panel adminPanel" style={{ marginTop: 16 }}>
              <h2 className="adminPanel__title">Stock ledger</h2>
              <p className="adminPanel__lede">Recent inventory events — sales, refunds, adjustments, and opening stock.</p>
              {stockMovements.length === 0 ? (
                <p className="muted adminEmptyHint">No stock movements yet. Run the latest database migration if this store existed before the ledger upgrade.</p>
              ) : (
                <div className="adminTableWrap">
                  <table className="adminTable">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Product</th>
                        <th>Δ</th>
                        <th>After</th>
                        <th>Reason</th>
                        <th>Actor</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.map((m) => (
                        <tr key={m.id}>
                          <td className="mono">{new Date(m.createdAt).toLocaleString()}</td>
                          <td>
                            <strong>{m.productName ?? m.productId.slice(0, 8)}</strong>
                            {m.barcode ? <div className="muted mono">{m.barcode}</div> : null}
                          </td>
                          <td className={m.delta < 0 ? "textDanger" : "textOk"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                          <td>{m.qtyAfter}</td>
                          <td>{m.reason}</td>
                          <td>{m.actor}</td>
                          <td className="muted">{m.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
          </div>
        </div>
          </>
        ) : null}

        {activeSection === "promotions" ? (
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
        ) : null}

        {message ? <div className="adminToast">{message}</div> : null}

        <OrderReceiptModal
          open={receiptOpen}
          loading={receiptLoading}
          error={receiptError}
          receipt={receiptData}
          onClose={closeReceiptModal}
        />

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

        {printTagProduct ? (
          <div className="printTagModal" style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}>
            <div className="printTagCard" style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "16px",
              padding: "24px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "var(--shadow)"
            }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Print Hang Tag</h3>
              <p className="muted" style={{ fontSize: "13px", marginBottom: "16px" }}>
                Send this SKU directly to your thermal barcode label printer.
              </p>
              <div id="barcode-print-area" style={{
                background: "white",
                color: "black",
                padding: "16px",
                borderRadius: "8px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #ccc",
                margin: "16px 0"
              }}>
                <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "4px", color: "black" }}>
                  {printTagProduct.brand || BRAND_NAME}
                </div>
                <div style={{ fontSize: "13px", marginBottom: "8px", color: "#333" }}>
                  {printTagProduct.name}
                </div>
                <div style={{ display: "flex", gap: "8px", fontSize: "11px", color: "#666", marginBottom: "8px" }}>
                  <span>Size: {printTagProduct.size || "—"}</span>
                  <span>Color: {printTagProduct.color || "—"}</span>
                </div>
                <BarcodeSVG value={printTagProduct.barcode} />
                <div style={{ fontSize: "14px", fontWeight: "bold", marginTop: "8px", color: "black" }}>
                  {money(printTagProduct.unitPrice)}
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button type="button" className="adminBtn" style={{ flex: 1 }} onClick={() => window.print()}>
                  Print
                </button>
                <button type="button" className="adminBtn adminBtn--ghost" style={{ flex: 1 }} onClick={() => setPrintTagProduct(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
  </div>
  );
}
