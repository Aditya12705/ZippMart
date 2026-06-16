import "dotenv/config";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { addCartItemSchema, checkoutSchema, createSessionSchema, setCartLineQtySchema } from "@checkout/shared";
import { verifyDb } from "./db/pool";
import {
  isProductImageStorageConfigured,
  productImageStorageStatus,
  uploadProductImageToStorage
} from "./storage/productImages";
import {
  adjustProductStock,
  commitSale,
  ConcurrentStockError,
  InsufficientStockError,
  listStockMovements,
  releaseExpiredReservations,
  releaseOrderReservations,
  reserveOrderFromSession,
  restockRefund,
  syncSessionReservations,
  withTransaction
} from "./db/inventory";
import {
  createOrder,
  createProduct,
  createSession,
  deleteDiscount,
  findProductByBarcode,
  findProductById,
  getDiscountMap,
  getDiscountPercent,
  getLatestSessionByPhone,
  getMetrics,
  getOrder,
  getOrderByToken,
  getReceiptByOrderId,
  getSession,
  insertReceipt,
  isExitTokenUsed,
  listAudit,
  listOrders,
  listPendingCounterOrders,
  listProducts,
  listReceipts,
  markExitTokenUsed,
  nextCounterToken,
  pushAudit,
  saveSessionCart,
  setDiscount,
  shelfUnitPrice,
  profitPerUnit,
  updateOrderPaid,
  updateOrderRefunded,
  updateOrderVoided,
  updateProductImage,
  type Order,
  type OrderLineSnapshot,
  type Product,
  type Session
} from "./db/store";

const app = express();
const uploadsRoot = path.join(process.cwd(), "uploads");
const productUploadsDir = path.join(uploadsRoot, "products");

app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use("/uploads", express.static(uploadsRoot));
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

const receiptNotifyWebhook = process.env.RECEIPT_NOTIFY_WEBHOOK_URL?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const emailFrom = process.env.EMAIL_FROM?.trim();
const lowStockNotifyWebhook = process.env.LOW_STOCK_NOTIFY_WEBHOOK_URL?.trim();
const port = Number(process.env.PORT ?? 4000);
const isProd = process.env.NODE_ENV === "production";

const jwtSecret = process.env.JWT_SECRET ?? (isProd ? "" : "dev-jwt-secret-local-only");
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const adminUsername = process.env.ADMIN_USERNAME ?? (isProd ? "" : "admin");
const adminPassword = process.env.ADMIN_PASSWORD ?? (isProd ? "" : "admin123");
const managerUsername = process.env.MANAGER_USERNAME ?? (isProd ? "" : "manager");
const managerPassword = process.env.MANAGER_PASSWORD ?? (isProd ? "" : "manager123");
const cashierApiKey = process.env.CASHIER_API_KEY?.trim();

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required in services/api/.env");
}
if (isProd && (!adminUsername || !adminPassword || !managerUsername || !managerPassword)) {
  throw new Error("ADMIN_* and MANAGER_* credentials are required in production");
}

function pathParam(value: string | string[] | undefined): string {
  if (value == null) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

type JwtRole = "staff" | "manager";

function requireAuth(minRole: "staff" | "manager") {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.headers.authorization;
    const auth = Array.isArray(raw) ? raw[0] : raw;
    const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, jwtSecret!) as { role?: string; sub?: string };
      const r = decoded.role === "manager" ? "manager" : decoded.role === "staff" ? "staff" : "";
      if (r !== "staff" && r !== "manager") return res.status(403).json({ message: "Forbidden" });
      if (minRole === "manager" && r !== "manager") return res.status(403).json({ message: "Manager role required" });
      (req as Request & { staff?: { sub: string; role: JwtRole } }).staff = {
        sub: String(decoded.sub ?? "user"),
        role: r
      };
      next();
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };
}

function requireCashierKey(req: Request, res: Response, next: NextFunction) {
  if (!cashierApiKey) return next();
  const key = req.headers["x-cashier-key"];
  const val = Array.isArray(key) ? key[0] : key;
  if (val !== cashierApiKey) return res.status(401).json({ message: "Invalid cashier key" });
  next();
}

async function toCustomerProduct(p: Product) {
  const d = await getDiscountPercent(p.id);
  const effective = shelfUnitPrice(p, d);
  return {
    id: p.id,
    barcode: p.barcode,
    sku: p.sku,
    name: p.name,
    category: p.category,
    styleCode: p.styleCode,
    size: p.size,
    color: p.color,
    brand: p.brand,
    season: p.season,
    gender: p.gender,
    unitPrice: effective,
    listPrice: p.unitPrice,
    discountPercent: d,
    taxPercent: p.taxPercent,
    demandScore: p.demandScore,
    inStock: p.availableQty,
    imageUrl: p.imageUrl ?? undefined
  };
}

function stockErrorResponse(res: Response, e: unknown) {
  if (e instanceof InsufficientStockError) {
    return res.status(409).json({ message: e.message, code: "INSUFFICIENT_STOCK", productId: e.productId });
  }
  if (e instanceof ConcurrentStockError) {
    return res.status(409).json({ message: e.message, code: "CONCURRENT_STOCK" });
  }
  return null;
}

async function persistSessionCart(session: Session): Promise<void> {
  await saveSessionCart(session.id, session.cart);
  await syncSessionReservations(
    session.id,
    session.storeId,
    session.cart,
    new Date(session.expiresAt)
  );
}

async function computeCart(session: Session) {
  const phone = (session.customerPhone ?? "").replace(/\D/g, "");
  let loyaltyDiscountPct = 0;
  if (phone.endsWith("77") || phone.endsWith("99")) {
    loyaltyDiscountPct = 10;
  } else if (phone.endsWith("00") || phone.endsWith("55")) {
    loyaltyDiscountPct = 5;
  }

  let subtotal = 0;
  let taxTotal = 0;
  let loyaltyDiscount = 0;
  const lines: Array<{
    productId: string;
    barcode: string;
    name: string;
    qty: number;
    unitPrice: number;
    taxPercent: number;
    lineSubtotal: number;
    lineTax: number;
    lineTotal: number;
  }> = [];

  for (const [productId, qty] of session.cart) {
    const product = await findProductById(productId);
    if (!product) continue;
    const d = await getDiscountPercent(productId);
    const unit = shelfUnitPrice(product, d);
    const lineSubtotal = unit * qty;
    
    // Apply loyalty discount to pre-tax price
    const discountAmount = lineSubtotal * (loyaltyDiscountPct / 100);
    const discountedLineSubtotal = lineSubtotal - discountAmount;
    const lineTax = (discountedLineSubtotal * product.taxPercent) / 100;

    subtotal += lineSubtotal;
    loyaltyDiscount += discountAmount;
    taxTotal += lineTax;

    lines.push({
      productId: product.id,
      barcode: product.barcode,
      name: product.name,
      qty,
      unitPrice: unit,
      taxPercent: product.taxPercent,
      lineSubtotal: discountedLineSubtotal,
      lineTax,
      lineTotal: discountedLineSubtotal + lineTax
    });
  }

  return {
    items: lines,
    subtotal,
    taxTotal,
    loyaltyDiscount,
    loyaltyDiscountPercent: loyaltyDiscountPct,
    grandTotal: Math.max(0, (subtotal - loyaltyDiscount) + taxTotal)
  };
}

function orderPublicView(order: Order) {
  return {
    orderId: order.id,
    tokenNumber: order.tokenNumber ?? null,
    paid: order.paid,
    paymentMode: order.paymentMode,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    grandTotal: order.total,
    lines: order.lines
  };
}

async function notifyReceiptWebhook(order: Order) {
  if (!receiptNotifyWebhook) return;
  try {
    await fetch(receiptNotifyWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "receipt",
        orderId: order.id,
        total: order.total,
        storeCode: order.storeCode,
        receiptEmail: order.receiptEmail ?? null,
        lines: order.lines.map((l) => ({ name: l.name, qty: l.qty, lineTotal: l.lineTotal }))
      })
    });
  } catch {
    await pushAudit("receipt", "system", "receipt.webhook.fail", order.id);
  }
}

function receiptEmailHtml(order: Order, receiptNumber: string): string {
  const rows = order.lines
    .map(
      (l) =>
        `<tr><td>${l.name}</td><td align="right">${l.qty}</td><td align="right">₹${l.lineTotal.toFixed(2)}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111">
<h2>SeamLine receipt</h2>
<p><strong>${receiptNumber}</strong> · ${order.storeCode}</p>
<table cellpadding="6" cellspacing="0" border="0">${rows}</table>
<p>Subtotal: ₹${order.subtotal.toFixed(2)}<br>Tax: ₹${order.taxTotal.toFixed(2)}<br><strong>Total: ₹${order.total.toFixed(2)}</strong></p>
<p>Thank you for shopping with SeamLine.</p>
</body></html>`;
}

async function sendReceiptEmail(order: Order, receiptNumber: string): Promise<boolean> {
  const to = order.receiptEmail?.trim();
  if (!resendApiKey || !emailFrom || !to) return false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [to],
        subject: `Your SeamLine receipt ${receiptNumber}`,
        html: receiptEmailHtml(order, receiptNumber)
      })
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("Resend API error", resp.status, detail);
    }
    return resp.ok;
  } catch (e) {
    console.error("receipt email failed", e);
    return false;
  }
}

async function recordPaidOrder(order: Order, whatsapp: string | null, auditActor: string, auditRole: string): Promise<string> {
  await withTransaction(async (client) => {
    await commitSale(
      order.id,
      order.lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      auditActor,
      client
    );
    await updateOrderPaid(order.id, true, client);
  });
  order.paid = true;
  const receiptId = `rcpt_${Date.now()}`;
  const receiptNumber = `SM-${Date.now()}`;
  await insertReceipt({
    id: receiptId,
    orderId: order.id,
    receiptNumber,
    total: order.total,
    paymentMode: order.paymentMode,
    whatsapp: null
  });
  await pushAudit(auditActor, auditRole, "order.settled", order.id);
  void notifyReceiptWebhook(order);
  void sendReceiptEmail(order, receiptNumber).then((ok) => {
    if (ok) void pushAudit("receipt", "system", "receipt.email.sent", order.id);
  });
  return receiptId;
}

app.get("/health", async (_req, res) => {
  try {
    await verifyDb();
    const imageStorage = productImageStorageStatus();
    res.json({
      ok: true,
      service: "checkout-api",
      database: "connected",
      imageStorage: imageStorage.configured ? "supabase" : "local",
      imageStorageHint: imageStorage.hint
    });
  } catch (e) {
    res.status(503).json({ ok: false, service: "checkout-api", database: "error", message: String(e) });
  }
});

app.post("/v1/admin/auth/login", async (req, res) => {
  const username = String(req.body?.username ?? "");
  const password = String(req.body?.password ?? "");
  const adminUser = adminUsername ?? "admin";
  const adminPass = adminPassword ?? "admin123";
  const mgrUser = managerUsername ?? "manager";
  const mgrPass = managerPassword ?? "manager123";
  let role: JwtRole | null = null;
  if (username === mgrUser && password === mgrPass) role = "manager";
  else if (username === adminUser && password === adminPass) role = "staff";
  if (!role) return res.status(401).json({ message: "Invalid username or password" });
  const token = jwt.sign({ role, sub: username }, jwtSecret!, { expiresIn: "8h" });
  await pushAudit(username, role, "auth.login", "ok");
  return res.json({ token, role, expiresInSeconds: 8 * 60 * 60 });
});

app.get("/v1/admin/metrics", requireAuth("staff"), async (req, res) => {
  const sc = String(req.query.storeCode ?? "").trim().toUpperCase();
  res.json(await getMetrics(sc || undefined));
});

app.get("/v1/admin/orders", requireAuth("staff"), async (req, res) => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 25;
  const sc = String(req.query.storeCode ?? "").trim().toUpperCase();
  const rows = await listOrders(limit, sc || undefined);
  res.json(
    rows.map((o) => ({
      orderId: o.id,
      createdAt: o.createdAt,
      storeCode: o.storeCode,
      paid: o.paid,
      voided: o.voided,
      refunded: o.refunded,
      paymentMode: o.paymentMode,
      tokenNumber: o.tokenNumber ?? null,
      grandTotal: o.total,
      lineCount: o.lines.length
    }))
  );
});

app.get("/v1/admin/products", requireAuth("staff"), async (_req, res) => {
  const products = await listProducts();
  const rows = await Promise.all(
    products.map(async (p) => {
      const d = await getDiscountPercent(p.id);
      const eff = shelfUnitPrice(p, d);
      return {
        ...p,
        discountPercent: d,
        effectiveUnitPrice: eff,
        profitPerUnitAtList: profitPerUnit(p, p.unitPrice),
        profitPerUnitAtSale: profitPerUnit(p, eff)
      };
    })
  );
  res.json(rows);
});

app.get("/v1/admin/discounts", requireAuth("staff"), async (_req, res) => {
  const products = await listProducts();
  const discountMap = await getDiscountMap();
  const rows = [...discountMap.entries()].map(([productId, discountPercent]) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return null;
    const eff = shelfUnitPrice(p, discountPercent);
    return {
      productId,
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      listPrice: p.unitPrice,
      discountPercent,
      effectiveUnitPrice: eff,
      profitPerUnitAtList: profitPerUnit(p, p.unitPrice),
      profitPerUnitAtSale: profitPerUnit(p, eff)
    };
  });
  res.json(rows.filter(Boolean));
});

app.post("/v1/admin/discounts", requireAuth("staff"), async (req, res) => {
  const productId = String(req.body?.productId ?? "");
  const pct = Number(req.body?.discountPercent);
  const p = await findProductById(productId);
  if (!p) return res.status(404).json({ message: "Product not found" });
  if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
    return res.status(400).json({ message: "discountPercent must be between 0 and 90" });
  }
  await setDiscount(productId, Math.floor(pct));
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  await pushAudit(actor, "staff", "discount.set", `${productId}=${Math.floor(pct)}`);
  return res.json({ ok: true, ...(await toCustomerProduct(p)) });
});

app.delete("/v1/admin/discounts/:productId", requireAuth("staff"), async (req, res) => {
  const id = pathParam(req.params.productId);
  await deleteDiscount(id);
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  await pushAudit(actor, "staff", "discount.delete", id);
  return res.json({ ok: true });
});

app.post("/v1/customer/session", async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const session = await createSession(parsed.data.storeCode, parsed.data.customerPhone);
  return res.status(201).json({ sessionId: session.id, expiresInMinutes: 60 });
});

app.get("/v1/customer/session/latest", async (req, res) => {
  const phone = String(req.query.phone ?? "").trim();
  if (phone.length < 8) return res.status(400).json({ message: "phone query must be at least 8 characters" });
  const hit = await getLatestSessionByPhone(phone);
  if (!hit) return res.status(404).json({ message: "No active visit found for that phone on this register" });
  return res.json({ sessionId: hit.id, storeCode: hit.storeCode, createdAt: hit.createdAt });
});

app.get("/v1/customer/recommendations", async (_req, res) => {
  const products = await listProducts();
  const highDemand = [...products].sort((a, b) => b.demandScore - a.demandScore).slice(0, 5);
  const highDemandRows = await Promise.all(highDemand.map(toCustomerProduct));
  return res.json({ highDemand: highDemandRows });
});

app.get("/v1/customer/products", async (req, res) => {
  const query = String(req.query.q ?? "").trim().toLowerCase();
  let products = await listProducts();
  if (query) {
    products = products.filter((p) => {
      const name = p.name.toLowerCase();
      const barcode = (p.barcode ?? "").toLowerCase();
      const category = (p.category ?? "").toLowerCase();
      const style = (p.styleCode ?? "").toLowerCase();
      const size = (p.size ?? "").toLowerCase();
      const color = (p.color ?? "").toLowerCase();
      const brand = (p.brand ?? "").toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      return (
        name.includes(query) ||
        barcode.includes(query) ||
        category.includes(query) ||
        style.includes(query) ||
        size.includes(query) ||
        color.includes(query) ||
        brand.includes(query) ||
        sku.includes(query)
      );
    });
  }
  res.json(await Promise.all(products.map(toCustomerProduct)));
});

app.post("/v1/customer/cart/items", async (req, res) => {
  const parsed = addCartItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const session = await getSession(parsed.data.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const product = await findProductByBarcode(parsed.data.barcode);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const currentQty = session.cart.get(product.id) ?? 0;
    session.cart.set(product.id, currentQty + parsed.data.quantity);
    await persistSessionCart(session);
    return res.json(await computeCart(session));
  } catch (e) {
    const handled = stockErrorResponse(res, e);
    if (handled) return handled;
    throw e;
  }
});

app.patch("/v1/customer/cart/items", async (req, res) => {
  const parsed = setCartLineQtySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const session = await getSession(parsed.data.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { productId, quantity } = parsed.data;
    if (quantity === 0) session.cart.delete(productId);
    else {
      const product = await findProductById(productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      session.cart.set(productId, quantity);
    }
    await persistSessionCart(session);
    return res.json(await computeCart(session));
  } catch (e) {
    const handled = stockErrorResponse(res, e);
    if (handled) return handled;
    throw e;
  }
});

app.get("/v1/customer/cart/:sessionId", async (req, res) => {
  const session = await getSession(pathParam(req.params.sessionId));
  if (!session) return res.status(404).json({ message: "Session not found" });
  return res.json(await computeCart(session));
});

app.post("/v1/customer/checkout", async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join(" ") || "Invalid checkout request";
    return res.status(400).json({ message, ...parsed.error.flatten() });
  }
  try {
    const session = await getSession(parsed.data.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const cart = await computeCart(session);
    if (cart.items.length === 0) return res.status(400).json({ message: "Cart is empty" });

    const lines: OrderLineSnapshot[] = cart.items.map((row) => {
      return {
        productId: row.productId,
        name: row.name,
        qty: row.qty,
        unitPrice: row.unitPrice,
        taxPercent: row.taxPercent,
        lineSubtotal: row.lineSubtotal,
        lineTax: row.lineTax,
        lineTotal: row.lineTotal
      };
    });

    const orderId = randomUUID();
    const order: Order = {
      id: orderId,
      sessionId: session.id,
      storeCode: session.storeCode,
      total: cart.grandTotal,
      subtotal: cart.subtotal - (cart.loyaltyDiscount ?? 0),
      taxTotal: cart.taxTotal,
      lines,
      paymentMode: parsed.data.paymentMode,
      paid: false,
      createdAt: new Date().toISOString(),
      voided: false,
      refunded: false,
      receiptEmail: parsed.data.receiptEmail ?? null,
      receiptPhone: parsed.data.receiptPhone ?? null
    };

    if (parsed.data.paymentMode === "COUNTER") {
      order.tokenNumber = await nextCounterToken();
    }

    const storeId = session.storeId;
    const holdUntil = new Date(Date.now() + 45 * 60 * 1000);

    await withTransaction(async (client) => {
      await releaseExpiredReservations(client);
      await syncSessionReservations(
        session.id,
        session.storeId,
        session.cart,
        new Date(session.expiresAt),
        client
      );
      await reserveOrderFromSession(
        session.id,
        orderId,
        storeId,
        lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        holdUntil,
        client
      );
      await createOrder(order, client);
    });

    session.cart.clear();
    await saveSessionCart(session.id, session.cart);

    if (parsed.data.paymentMode === "ONLINE") {
      return res.status(201).json({
        orderId,
        status: "PENDING_PAYMENT",
        razorpayOrderId: process.env.RAZORPAY_KEY_ID ? `rzp_order_${orderId.replace(/-/g, "")}` : null
      });
    }

    return res.status(201).json({
      orderId,
      status: "AWAITING_COUNTER_PAYMENT",
      tokenNumber: order.tokenNumber
    });
  } catch (e) {
    console.error("checkout failed", e);
    const handled = stockErrorResponse(res, e);
    if (handled) return handled;
    const detail = e instanceof Error ? e.message : String(e);
    if (detail.includes("Unknown store")) {
      return res.status(400).json({ message: "This store is not set up yet. Ask staff for help." });
    }
    return res.status(500).json({ message: "Checkout could not be completed. Please try again or pay at the counter." });
  }
});

app.get("/v1/customer/orders/:orderId", async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order || order.voided) return res.status(404).json({ message: "Order not found" });
  const status = order.paid
    ? "PAID"
    : order.paymentMode === "COUNTER"
      ? "AWAITING_COUNTER_PAYMENT"
      : "PENDING_PAYMENT";
  return res.json({
    orderId: order.id,
    paid: order.paid,
    paymentMode: order.paymentMode,
    tokenNumber: order.tokenNumber ?? null,
    status,
    grandTotal: order.total,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal
  });
});

async function buildReceiptPayload(orderId: string) {
  const order = await getOrder(orderId);
  if (!order || order.voided) {
    return { status: 404 as const, body: { message: "Order not found" } };
  }
  if (!order.paid) {
    return { status: 402 as const, body: { message: "Payment not confirmed yet", paid: false } };
  }
  const rec = await getReceiptByOrderId(order.id);
  const emailConfigured = Boolean(resendApiKey && emailFrom);
  return {
    status: 200 as const,
    body: {
      receiptNumber: rec?.receiptNumber ?? `ORD-${order.id.slice(0, 8)}`,
      orderId: order.id,
      storeCode: order.storeCode,
      createdAt: rec?.createdAt ?? order.createdAt,
      paymentMode: order.paymentMode,
      lines: order.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        taxPercent: l.taxPercent,
        lineTotal: l.lineTotal
      })),
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      grandTotal: order.total,
      receiptEmail: order.receiptEmail ?? null,
      emailConfigured,
      tokenNumber: order.tokenNumber ?? null
    }
  };
}

app.get("/v1/customer/orders/:orderId/receipt", async (req, res) => {
  const result = await buildReceiptPayload(pathParam(req.params.orderId));
  return res.status(result.status).json(result.body);
});

app.get("/v1/admin/orders/:orderId/receipt", requireAuth("staff"), async (req, res) => {
  const result = await buildReceiptPayload(pathParam(req.params.orderId));
  return res.status(result.status).json(result.body);
});

app.get("/v1/customer/orders/:orderId/exit-pass", async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order || order.voided) return res.status(404).json({ message: "Order not found" });
  if (!order.paid) {
    return res.status(402).json({
      message: "Payment not confirmed yet",
      paid: false,
      tokenNumber: order.tokenNumber ?? null
    });
  }
  const token = jwt.sign({ orderId: order.id, exp: Math.floor(Date.now() / 1000) + 15 * 60 }, jwtSecret!);
  const exitQr = await QRCode.toDataURL(token);
  return res.json({
    paid: true,
    orderId: order.id,
    exitQr,
    grandTotal: order.total
  });
});

app.get("/v1/cashier/orders/:orderId", requireCashierKey, async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order || order.voided) return res.status(404).json({ message: "Order not found" });
  return res.json(orderPublicView(order));
});

app.get("/v1/cashier/orders/by-token/:token", requireCashierKey, async (req, res) => {
  const raw = pathParam(req.params.token);
  const token = Number(raw);
  if (!Number.isFinite(token)) return res.status(400).json({ message: "Invalid token number" });
  const order = await getOrderByToken(token);
  if (!order) return res.status(404).json({ message: "No order for this token" });
  return res.json(orderPublicView(order));
});

app.get("/v1/cashier/pending", requireCashierKey, async (_req, res) => {
  const pending = await listPendingCounterOrders();
  res.json(
    pending.map((o) => ({
      orderId: o.id,
      tokenNumber: o.tokenNumber ?? null,
      grandTotal: o.total,
      lineCount: o.lines.length,
      createdAt: o.createdAt
    }))
  );
});

app.get("/v1/cashier/stats/today", requireCashierKey, async (_req, res) => {
  const all = await listOrders(500);
  const today = new Date().toISOString().slice(0, 10);
  const todayPaid = all.filter((o) => o.paid && !o.refunded && o.createdAt.startsWith(today));
  const todayPending = all.filter((o) => !o.paid && !o.voided && !o.refunded && o.createdAt.startsWith(today));
  const revenue = todayPaid.reduce((s, o) => s + o.total, 0);
  res.json({
    paidCount: todayPaid.length,
    pendingCount: todayPending.length,
    revenueToday: Math.round(revenue * 100) / 100
  });
});

app.post("/v1/cashier/orders/:orderId/settle", requireCashierKey, async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.paymentMode !== "COUNTER") return res.status(400).json({ message: "Not a counter-pay order" });
  if (order.paid) return res.status(400).json({ message: "Already marked as paid" });
  if (order.voided || order.refunded) return res.status(400).json({ message: "Order is voided or refunded" });
  try {
    const receiptId = await recordPaidOrder(order, null, "cashier", "staff");
    return res.json({ ok: true, receiptId, orderId: order.id });
  } catch (e) {
    const handled = stockErrorResponse(res, e);
    if (handled) return handled;
    throw e;
  }
});

app.post("/v1/payments/razorpay/webhook", async (req, res) => {
  if (!webhookSecret) return res.status(503).json({ message: "Webhook not configured" });
  const signature = req.headers["x-razorpay-signature"];
  if (!signature || signature !== webhookSecret) return res.status(401).json({ message: "Invalid webhook signature" });
  const orderId = String(req.body.orderId ?? "");
  const order = await getOrder(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.paid || order.voided || order.refunded) return res.json({ ok: true, duplicate: true });
  await recordPaidOrder(order, null, "razorpay-webhook", "system");
  return res.json({ ok: true });
});

app.post("/v1/admin/tokens/:orderId/settle", requireAuth("staff"), async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order || order.paymentMode !== "COUNTER") return res.status(404).json({ message: "Counter order not found" });
  if (order.paid || order.voided || order.refunded) return res.status(400).json({ message: "Order cannot be settled" });
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  const receiptId = await recordPaidOrder(order, null, actor, "staff");
  return res.json({ ok: true, receiptId });
});

app.get("/v1/admin/tokens", requireAuth("staff"), async (_req, res) => {
  res.json(await listPendingCounterOrders());
});

app.get("/v1/admin/recommendations", requireAuth("staff"), async (_req, res) => {
  const products = await listProducts();
  const highDemand = [...products].sort((a, b) => b.demandScore - a.demandScore).slice(0, 5);
  res.json({ highDemand: await Promise.all(highDemand.map(toCustomerProduct)) });
});

app.post("/v1/admin/products", requireAuth("staff"), async (req, res) => {
  const body = req.body as Partial<Product> & { sellingPrice?: number };
  const sell = Number(body.unitPrice ?? body.sellingPrice ?? 0);
  const cost = Number(body.costPrice ?? 0);
  if (!body.barcode || !body.name || !body.category || !Number.isFinite(sell) || sell <= 0) {
    return res.status(400).json({ message: "barcode, name, category, and unitPrice (selling) are required" });
  }
  const existing = await findProductByBarcode(String(body.barcode).trim());
  if (existing) return res.status(409).json({ message: "A product with this barcode already exists" });
  if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: "costPrice must be a non-negative number" });
  if (cost > sell) return res.status(400).json({ message: "costPrice should not exceed selling price" });
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  const created = await createProduct(
    {
      barcode: String(body.barcode).trim(),
      name: String(body.name),
      category: String(body.category),
      styleCode: String(body.styleCode ?? ""),
      size: String(body.size ?? ""),
      color: String(body.color ?? ""),
      brand: String(body.brand ?? ""),
      season: String(body.season ?? ""),
      gender: String(body.gender ?? "Unisex"),
      unitPrice: Math.round(sell * 100) / 100,
      costPrice: Math.round(cost * 100) / 100,
      taxPercent: Number(body.taxPercent ?? 5),
      inStock: Math.max(0, Math.floor(Number(body.inStock ?? 0))),
      reorderLevel: Math.max(0, Math.floor(Number(body.reorderLevel ?? 10))),
      demandScore: Math.max(0, Number(body.demandScore ?? 0)),
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() : undefined
    },
    actor
  );
  await pushAudit(actor, "staff", "product.create", `${created.barcode} ${created.name}`);
  const d = await getDiscountPercent(created.id);
  const eff = shelfUnitPrice(created, d);
  return res.status(201).json({
    ...created,
    discountPercent: d,
    effectiveUnitPrice: eff,
    profitPerUnitAtList: profitPerUnit(created, created.unitPrice),
    profitPerUnitAtSale: profitPerUnit(created, eff)
  });
});

app.patch("/v1/admin/products/:id/inventory", requireAuth("staff"), async (req, res) => {
  const inStock = Math.max(0, Math.floor(Number(req.body.inStock ?? 0)));
  const note = String(req.body?.note ?? "").trim() || "Manual stock adjustment";
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  try {
    await adjustProductStock(pathParam(req.params.id), inStock, actor, note);
    const product = await findProductById(pathParam(req.params.id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    await pushAudit(actor, "staff", "inventory.patch", `${product.id}=${product.inStock} (${note})`);
    return res.json(product);
  } catch (e) {
    const handled = stockErrorResponse(res, e);
    if (handled) return handled;
    if (e instanceof Error && e.message === "Product not found") {
      return res.status(404).json({ message: "Product not found" });
    }
    throw e;
  }
});

app.get("/v1/admin/inventory/movements", requireAuth("staff"), async (req, res) => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) ? Math.min(500, Math.max(1, Math.floor(raw))) : 100;
  const productId = String(req.query.productId ?? "").trim() || undefined;
  res.json(await listStockMovements(limit, productId));
});

app.post("/v1/admin/upload/product-image", requireAuth("staff"), async (req, res) => {
  const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ message: "Send a JPEG, PNG, or WebP image as dataUrl" });
  const mime = match[1];
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const buf = Buffer.from(match[2], "base64");
  if (buf.length > 4 * 1024 * 1024) return res.status(400).json({ message: "Image too large (max 4 MB)" });
  try {
    if (isProductImageStorageConfigured()) {
      const url = await uploadProductImageToStorage(buf, ext, mime);
      return res.json({ url, storage: "supabase" });
    }
    await fs.mkdir(productUploadsDir, { recursive: true });
    const fname = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(productUploadsDir, fname), buf);
    const publicBase = process.env.PUBLIC_API_URL?.trim() || `http://localhost:${port}`;
    return res.json({ url: `${publicBase}/uploads/products/${fname}`, storage: "local" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    console.error("[upload/product-image]", msg);
    return res.status(500).json({ message: msg });
  }
});

app.patch("/v1/admin/products/:id/image", requireAuth("staff"), async (req, res) => {
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
  const product = await updateProductImage(pathParam(req.params.id), imageUrl || null);
  if (!product) return res.status(404).json({ message: "Product not found" });
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  await pushAudit(actor, "staff", "product.image", product.id);
  const d = await getDiscountPercent(product.id);
  const eff = shelfUnitPrice(product, d);
  return res.json({
    ...product,
    discountPercent: d,
    effectiveUnitPrice: eff,
    profitPerUnitAtList: profitPerUnit(product, product.unitPrice),
    profitPerUnitAtSale: profitPerUnit(product, eff)
  });
});

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

app.get("/v1/admin/audit", requireAuth("manager"), async (_req, res) => {
  res.json(await listAudit(250));
});

app.post("/v1/admin/orders/:orderId/void", requireAuth("manager"), async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.refunded) return res.status(400).json({ message: "Refunded order cannot be voided" });
  if (order.paid) return res.status(400).json({ message: "Paid order — use refund to reverse stock" });
  if (order.voided) return res.status(400).json({ message: "Already voided" });
  await withTransaction(async (client) => {
    await releaseOrderReservations(order.id, client);
    await updateOrderVoided(order.id, true, client);
  });
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "manager";
  await pushAudit(actor, "manager", "order.void", order.id);
  return res.json({ ok: true });
});

app.post("/v1/admin/orders/:orderId/refund", requireAuth("manager"), async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (!order.paid) return res.status(400).json({ message: "Order is not paid — void instead if still open" });
  if (order.refunded) return res.status(400).json({ message: "Already refunded" });
  if (order.voided) return res.status(400).json({ message: "Voided order" });
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "manager";
  await withTransaction(async (client) => {
    await restockRefund(
      order.id,
      order.lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      actor,
      client
    );
    await updateOrderRefunded(order.id, client);
  });
  await pushAudit(actor, "manager", "order.refund", order.id);
  return res.json({ ok: true });
});

app.get("/v1/admin/export/orders.csv", requireAuth("manager"), async (req, res) => {
  const sc = String(req.query.storeCode ?? "").trim().toUpperCase();
  const rows = await listOrders(10000, sc || undefined);
  const header = ["orderId", "createdAt", "storeCode", "paid", "voided", "refunded", "paymentMode", "token", "total", "lines"].join(",");
  const body = rows
    .map((o) =>
      [o.id, o.createdAt, o.storeCode, o.paid, o.voided, o.refunded, o.paymentMode, o.tokenNumber ?? "", o.total, o.lines.length]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${Date.now()}.csv"`);
  res.send(`${header}\n${body}\n`);
});

app.get("/v1/admin/export/products.csv", requireAuth("staff"), async (_req, res) => {
  const products = await listProducts();
  const header = [
    "id",
    "barcode",
    "sku",
    "name",
    "category",
    "styleCode",
    "size",
    "color",
    "brand",
    "season",
    "gender",
    "unitPrice",
    "costPrice",
    "taxPercent",
    "inStock"
  ].join(",");
  const body = products
    .map((p) =>
      [
        p.id,
        p.barcode,
        p.sku,
        p.name,
        p.category,
        p.styleCode,
        p.size,
        p.color,
        p.brand,
        p.season,
        p.gender,
        p.unitPrice,
        p.costPrice,
        p.taxPercent,
        p.inStock
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="products-${Date.now()}.csv"`);
  res.send(`${header}\n${body}\n`);
});

app.post("/v1/admin/orders/:orderId/receipt-send", requireAuth("staff"), async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order) return res.status(404).json({ message: "Order not found" });
  const channel = String(req.body?.channel ?? "email");
  const to = String(req.body?.to ?? "").trim();
  if (!to) return res.status(400).json({ message: "to is required (email or phone)" });
  const actor = (req as Request & { staff?: { sub: string } }).staff?.sub ?? "staff";
  await pushAudit(actor, "staff", "receipt.manual", `${order.id};${channel};${to}`);
  if (receiptNotifyWebhook) {
    try {
      await fetch(receiptNotifyWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "receipt_manual",
          orderId: order.id,
          channel,
          to,
          total: order.total,
          lines: order.lines.map((l) => ({ name: l.name, qty: l.qty, lineTotal: l.lineTotal }))
        })
      });
    } catch {
      return res.status(502).json({ message: "Webhook request failed" });
    }
  }
  return res.json({
    ok: true,
    sent: !!receiptNotifyWebhook,
    detail: receiptNotifyWebhook ? "Sent to RECEIPT_NOTIFY_WEBHOOK_URL" : "Configure RECEIPT_NOTIFY_WEBHOOK_URL for SMS/email integrations"
  });
});

app.post("/v1/receipt/:orderId", async (req, res) => {
  const order = await getOrder(pathParam(req.params.orderId));
  if (!order || !order.paid) return res.status(400).json({ message: "Order not paid yet" });
  const token = jwt.sign({ orderId: order.id, exp: Math.floor(Date.now() / 1000) + 15 * 60 }, jwtSecret!);
  const qrDataUrl = await QRCode.toDataURL(token);
  const receiptId = `rcpt_${Date.now()}`;
  await insertReceipt({
    id: receiptId,
    orderId: order.id,
    receiptNumber: `SM-${Date.now()}`,
    total: order.total,
    paymentMode: order.paymentMode,
    whatsapp: req.body.whatsapp ?? null
  });
  return res.json({
    receipt: { id: receiptId, orderId: order.id, receiptNumber: `SM-${Date.now()}`, total: order.total, paymentMode: order.paymentMode },
    exitQr: qrDataUrl,
    exitToken: token
  });
});

app.post("/v1/gate/verify", async (req, res) => {
  try {
    const token = String(req.body.token);
    const hash = createHash("sha256").update(token).digest("hex");
    if (await isExitTokenUsed(hash)) return res.status(400).json({ valid: false, reason: "Exit token already used" });
    const payload = jwt.verify(token, jwtSecret!) as { orderId: string };
    const order = await getOrder(payload.orderId);
    if (!order?.paid || order.refunded) return res.status(400).json({ valid: false, reason: "Unpaid or refunded order" });
    await markExitTokenUsed(hash);
    return res.json({ valid: true, orderId: payload.orderId });
  } catch {
    return res.status(400).json({ valid: false, reason: "Invalid or expired exit token" });
  }
});

app.get("/v1/admin/receipts", requireAuth("staff"), async (_req, res) => {
  res.json(await listReceipts());
});

async function maybeNotifyLowStockWebhook() {
  if (!lowStockNotifyWebhook) return;
  const products = await listProducts();
  const skus = products.filter((p) => p.availableQty < 5);
  if (skus.length === 0) return;
  try {
    await fetch(lowStockNotifyWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "low_stock_scheduled",
        at: new Date().toISOString(),
        count: skus.length,
        skus: skus.map((p) => ({ barcode: p.barcode, name: p.name, inStock: p.inStock, available: p.availableQty, reserved: p.reservedQty }))
      })
    });
    await pushAudit("scheduler", "system", "low_stock.webhook", String(skus.length));
  } catch {
    await pushAudit("scheduler", "system", "low_stock.webhook.fail", String(skus.length));
  }
}

const lowStockIntervalMs = Number(process.env.LOW_STOCK_CHECK_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
setInterval(() => void maybeNotifyLowStockWebhook(), lowStockIntervalMs);

const reservationSweepMs = Number(process.env.RESERVATION_SWEEP_INTERVAL_MS ?? 5 * 60 * 1000);
setInterval(() => {
  void releaseExpiredReservations().catch((e) => console.error("reservation sweep failed", e));
}, reservationSweepMs);

async function main() {
  await verifyDb();
  console.log("Database connected");
  app.listen(port, () => {
    console.log(`Checkout API running on http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error("Failed to start API:", e instanceof Error ? e.message : e);
  console.error("");
  console.error("Fix: create services/api/.env (copy from .env.example) and set DATABASE_URL.");
  console.error("Supabase → Project Settings → Database → Connection string → URI (pooler, port 6543).");
  process.exit(1);
});
