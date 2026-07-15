import { randomUUID } from "crypto";
import type pg from "pg";
import { getReservationSummary, recordInitialStock, withTransaction } from "./inventory";
import { getPool, round2 } from "./pool";

export type Product = {
  id: string;
  barcode: string;
  sku: string;
  name: string;
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
};

export type OrderLineSnapshot = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  sessionId: string;
  storeCode: string;
  total: number;
  subtotal: number;
  taxTotal: number;
  lines: OrderLineSnapshot[];
  paymentMode: "ONLINE" | "COUNTER";
  paid: boolean;
  tokenNumber?: number;
  createdAt: string;
  voided: boolean;
  refunded: boolean;
  receiptEmail?: string | null;
  receiptPhone?: string | null;
};

export type Session = {
  id: string;
  storeId: string;
  storeCode: string;
  cart: Map<string, number>;
  customerPhone?: string;
  createdAt: string;
  expiresAt: string;
};

type ProductRow = {
  id: string;
  barcode: string;
  sku: string;
  name: string;
  category: string;
  style_code: string;
  size: string;
  color: string;
  brand: string;
  season: string;
  gender: string;
  unit_price: string;
  cost_price: string;
  tax_percent: string;
  in_stock: number;
  reorder_level: number;
  demand_score: string;
  image_url: string | null;
};

const PRODUCT_SELECT = `id, barcode, sku, name, category, style_code, size, color, brand, season, gender,
     unit_price, cost_price, tax_percent, in_stock, reorder_level, demand_score, image_url`;

function buildVariantSku(styleCode: string, color: string, size: string, barcode: string): string {
  const parts = [styleCode, color, size]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase().replace(/\s+/g, "-"));
  if (parts.length > 0) return parts.join("-");
  return barcode.trim();
}

function mapProduct(row: ProductRow, reservedQty = 0): Product {
  const inStock = row.in_stock;
  return {
    id: row.id,
    barcode: row.barcode,
    sku: row.sku,
    name: row.name,
    category: row.category,
    styleCode: row.style_code ?? "",
    size: row.size ?? "",
    color: row.color ?? "",
    brand: row.brand ?? "",
    season: row.season ?? "",
    gender: row.gender ?? "Unisex",
    unitPrice: Number(row.unit_price),
    costPrice: Number(row.cost_price),
    taxPercent: Number(row.tax_percent),
    inStock,
    reservedQty,
    availableQty: Math.max(0, inStock - reservedQty),
    reorderLevel: row.reorder_level ?? 10,
    demandScore: Number(row.demand_score),
    imageUrl: row.image_url
  };
}

async function attachReservationCounts(products: Product[]): Promise<Product[]> {
  const reserved = await getReservationSummary();
  return products.map((p) => {
    const reservedQty = reserved.get(p.id) ?? 0;
    return {
      ...p,
      reservedQty,
      availableQty: Math.max(0, p.inStock - reservedQty)
    };
  });
}

const defaultStoreCode = process.env.DEFAULT_STORE_CODE?.trim().toUpperCase() || "BLR001";

export async function getDefaultStoreId(): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    "SELECT id FROM stores WHERE code = $1 LIMIT 1",
    [defaultStoreCode]
  );
  if (!rows[0]) {
    throw new Error(`Store ${defaultStoreCode} not found — run Supabase migrations`);
  }
  return rows[0].id;
}

export async function getStoreIdByCode(code: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>("SELECT id FROM stores WHERE code = $1 LIMIT 1", [
    code.toUpperCase()
  ]);
  return rows[0]?.id ?? null;
}

export async function listProducts(): Promise<Product[]> {
  const storeId = await getDefaultStoreId();
  const { rows } = await getPool().query<ProductRow>(
    `SELECT ${PRODUCT_SELECT}
     FROM products WHERE store_id = $1 AND is_active = TRUE ORDER BY name`,
    [storeId]
  );
  return attachReservationCounts(rows.map((row) => mapProduct(row)));
}

export async function findProductById(id: string): Promise<Product | null> {
  const { rows } = await getPool().query<ProductRow>(
    `SELECT ${PRODUCT_SELECT}
     FROM products WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const reserved = await getReservationSummary();
  return mapProduct(rows[0], reserved.get(id) ?? 0);
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const storeId = await getDefaultStoreId();
  const { rows } = await getPool().query<ProductRow>(
    `SELECT ${PRODUCT_SELECT}
     FROM products WHERE store_id = $1 AND barcode = $2 AND is_active = TRUE LIMIT 1`,
    [storeId, barcode]
  );
  if (!rows[0]) return null;
  const reserved = await getReservationSummary();
  return mapProduct(rows[0], reserved.get(rows[0].id) ?? 0);
}

export async function createProduct(
  input: Omit<Product, "id" | "sku" | "reservedQty" | "availableQty">,
  actor = "staff"
): Promise<Product> {
  return withTransaction(async (client) => {
    const storeId = await getDefaultStoreId();
    const id = randomUUID();
    const imageUrl = input.imageUrl?.trim() || null;
    const sku = buildVariantSku(input.styleCode, input.color, input.size, input.barcode);
    const { rows } = await client.query<ProductRow>(
      `INSERT INTO products (id, store_id, barcode, sku, name, category, style_code, size, color, brand, season, gender,
         unit_price, cost_price, tax_percent, in_stock, reorder_level, demand_score, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ${PRODUCT_SELECT}`,
      [
        id,
        storeId,
        input.barcode,
        sku,
        input.name,
        input.category,
        input.styleCode?.trim() ?? "",
        input.size?.trim() ?? "",
        input.color?.trim() ?? "",
        input.brand?.trim() ?? "",
        input.season?.trim() ?? "",
        input.gender?.trim() || "Unisex",
        input.unitPrice,
        input.costPrice,
        input.taxPercent,
        input.inStock,
        input.reorderLevel ?? 10,
        input.demandScore,
        imageUrl
      ]
    );
    if (input.inStock > 0) {
      await recordInitialStock(id, storeId, input.inStock, actor, client);
    }
    return mapProduct(rows[0]);
  });
}

export async function updateProductDetails(
  id: string,
  input: {
    barcode: string;
    name: string;
    category: string;
    styleCode: string;
    size: string;
    color: string;
    brand: string;
    season: string;
    gender: string;
    unitPrice: number;
    costPrice: number;
    reorderLevel: number;
    taxPercent: number;
    demandScore: number;
    imageUrl?: string | null;
  }
): Promise<Product | null> {
  const imageUrl = input.imageUrl?.trim() || null;
  const sku = buildVariantSku(input.styleCode, input.color, input.size, input.barcode);
  const { rows } = await getPool().query<ProductRow>(
    `UPDATE products
     SET barcode = $2,
         sku = $3,
         name = $4,
         category = $5,
         style_code = $6,
         size = $7,
         color = $8,
         brand = $9,
         season = $10,
         gender = $11,
         unit_price = $12,
         cost_price = $13,
         reorder_level = $14,
         tax_percent = $15,
         demand_score = $16,
         image_url = $17
     WHERE id = $1 AND is_active = TRUE
     RETURNING ${PRODUCT_SELECT}`,
    [
      id,
      input.barcode,
      sku,
      input.name,
      input.category,
      input.styleCode?.trim() ?? "",
      input.size?.trim() ?? "",
      input.color?.trim() ?? "",
      input.brand?.trim() ?? "",
      input.season?.trim() ?? "",
      input.gender?.trim() || "Unisex",
      input.unitPrice,
      input.costPrice,
      input.reorderLevel ?? 10,
      input.taxPercent,
      input.demandScore,
      imageUrl
    ]
  );
  if (!rows[0]) return null;
  const reserved = await getReservationSummary();
  return mapProduct(rows[0], reserved.get(id) ?? 0);
}

export async function updateProductImage(id: string, imageUrl: string | null): Promise<Product | null> {
  const { rows } = await getPool().query<ProductRow>(
    `UPDATE products SET image_url = $2
     WHERE id = $1 AND is_active = TRUE
     RETURNING ${PRODUCT_SELECT}`,
    [id, imageUrl?.trim() || null]
  );
  if (!rows[0]) return null;
  const reserved = await getReservationSummary();
  return mapProduct(rows[0], reserved.get(id) ?? 0);
}

export async function updateProductStock(id: string, inStock: number): Promise<Product | null> {
  const { rows } = await getPool().query<ProductRow>(
    `UPDATE products SET in_stock = $2
     WHERE id = $1 AND is_active = TRUE
     RETURNING ${PRODUCT_SELECT}`,
    [id, inStock]
  );
  if (!rows[0]) return null;
  const reserved = await getReservationSummary();
  return mapProduct(rows[0], reserved.get(id) ?? 0);
}

export async function getDiscountMap(): Promise<Map<string, number>> {
  const { rows } = await getPool().query<{ product_id: string; discount_percent: number }>(
    "SELECT product_id, discount_percent FROM product_discounts"
  );
  return new Map(rows.map((r) => [r.product_id, r.discount_percent]));
}

export async function getDiscountPercent(productId: string): Promise<number> {
  const { rows } = await getPool().query<{ discount_percent: number }>(
    "SELECT discount_percent FROM product_discounts WHERE product_id = $1",
    [productId]
  );
  return rows[0]?.discount_percent ?? 0;
}

export async function setDiscount(productId: string, pct: number): Promise<void> {
  await getPool().query(
    `INSERT INTO product_discounts (product_id, discount_percent) VALUES ($1, $2)
     ON CONFLICT (product_id) DO UPDATE SET discount_percent = EXCLUDED.discount_percent, updated_at = NOW()`,
    [productId, pct]
  );
}

export async function deleteDiscount(productId: string): Promise<void> {
  await getPool().query("DELETE FROM product_discounts WHERE product_id = $1", [productId]);
}

export async function pushAudit(actor: string, role: string, action: string, detail: string): Promise<void> {
  await getPool().query(
    "INSERT INTO audit_log (actor, role, action, detail) VALUES ($1, $2, $3, $4)",
    [actor, role, action, detail.slice(0, 2000)]
  );
}

export async function listAudit(limit = 250) {
  const { rows } = await getPool().query(
    `SELECT id, at, actor, role, action, detail FROM audit_log ORDER BY at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).toISOString(),
    actor: r.actor,
    role: r.role,
    action: r.action,
    detail: r.detail
  }));
}

export async function createSession(storeCode: string, customerPhone?: string): Promise<Session> {
  const storeId = (await getStoreIdByCode(storeCode)) ?? (await getDefaultStoreId());
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await getPool().query(
    `INSERT INTO customer_sessions (id, store_id, store_code, customer_phone, cart, expires_at)
     VALUES ($1, $2, $3, $4, '{}', $5)`,
    [id, storeId, storeCode.toUpperCase(), customerPhone ?? null, expiresAt.toISOString()]
  );
  return {
    id,
    storeId,
    storeCode: storeCode.toUpperCase(),
    cart: new Map(),
    customerPhone,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

export async function getSession(id: string): Promise<Session | null> {
  const { rows } = await getPool().query<{
    id: string;
    store_id: string;
    store_code: string;
    customer_phone: string | null;
    cart: Record<string, number>;
    created_at: Date;
    expires_at: Date;
    status: string;
  }>("SELECT * FROM customer_sessions WHERE id = $1 AND status = 'active' AND expires_at > NOW() LIMIT 1", [id]);
  const row = rows[0];
  if (!row) return null;
  const cartObj = row.cart ?? {};
  const cart = new Map<string, number>(Object.entries(cartObj).map(([k, v]) => [k, Number(v)]));
  return {
    id: row.id,
    storeId: row.store_id,
    storeCode: row.store_code,
    cart,
    customerPhone: row.customer_phone ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString()
  };
}

export async function saveSessionCart(sessionId: string, cart: Map<string, number>): Promise<void> {
  const obj: Record<string, number> = {};
  for (const [k, v] of cart) obj[k] = v;
  await getPool().query("UPDATE customer_sessions SET cart = $2::jsonb WHERE id = $1", [sessionId, JSON.stringify(obj)]);
}

export async function getLatestSessionByPhone(phone: string): Promise<Session | null> {
  const norm = phone.replace(/\s/g, "");
  const { rows } = await getPool().query<{
    id: string;
    store_id: string;
    store_code: string;
    customer_phone: string | null;
    cart: Record<string, number>;
    created_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, store_id, store_code, customer_phone, cart, created_at, expires_at FROM customer_sessions
     WHERE REPLACE(COALESCE(customer_phone, ''), ' ', '') = $1 AND status = 'active' AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [norm]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    storeCode: row.store_code,
    cart: new Map(Object.entries(row.cart ?? {}).map(([k, v]) => [k, Number(v)])),
    customerPhone: row.customer_phone ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString()
  };
}

function mapOrder(row: {
  id: string;
  session_id: string;
  store_code: string;
  subtotal: string;
  tax_total: string;
  total: string;
  lines: OrderLineSnapshot[];
  payment_mode: string;
  paid: boolean;
  token_number: number | null;
  voided: boolean;
  refunded: boolean;
  receipt_email: string | null;
  receipt_phone: string | null;
  created_at: Date;
}): Order {
  return {
    id: row.id,
    sessionId: row.session_id,
    storeCode: row.store_code,
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    total: Number(row.total),
    lines: row.lines,
    paymentMode: row.payment_mode as "ONLINE" | "COUNTER",
    paid: row.paid,
    tokenNumber: row.token_number ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    voided: row.voided,
    refunded: row.refunded,
    receiptEmail: row.receipt_email,
    receiptPhone: row.receipt_phone
  };
}

export async function createOrder(order: Order, client?: pg.PoolClient): Promise<void> {
  const storeId = await getStoreIdByCode(order.storeCode);
  if (!storeId) throw new Error("Unknown store");
  const q = client ?? getPool();
  await q.query(
    `INSERT INTO orders (id, session_id, store_id, store_code, subtotal, tax_total, total, lines, payment_mode, paid, token_number, voided, refunded, receipt_email, receipt_phone, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      order.id,
      order.sessionId,
      storeId,
      order.storeCode,
      order.subtotal,
      order.taxTotal,
      order.total,
      JSON.stringify(order.lines),
      order.paymentMode,
      order.paid,
      order.tokenNumber ?? null,
      order.voided,
      order.refunded,
      order.receiptEmail ?? null,
      order.receiptPhone ?? null,
      order.createdAt
    ]
  );
}

export async function getOrder(id: string): Promise<Order | null> {
  const { rows } = await getPool().query("SELECT * FROM orders WHERE id = $1 LIMIT 1", [id]);
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function getOrderByToken(token: number): Promise<Order | null> {
  const { rows } = await getPool().query(
    "SELECT * FROM orders WHERE token_number = $1 AND voided = FALSE ORDER BY created_at DESC LIMIT 1",
    [token]
  );
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function listOrders(limit: number, storeCode?: string) {
  const params: unknown[] = [limit];
  let sql = "SELECT * FROM orders";
  if (storeCode) {
    sql += " WHERE store_code = $2";
    params.push(storeCode);
  }
  sql += " ORDER BY created_at DESC LIMIT $1";
  const { rows } = await getPool().query(sql, params);
  return rows.map(mapOrder);
}

export async function listPendingCounterOrders(): Promise<Order[]> {
  const { rows } = await getPool().query(
    `SELECT * FROM orders WHERE payment_mode = 'COUNTER' AND paid = FALSE AND voided = FALSE AND refunded = FALSE ORDER BY created_at ASC`
  );
  return rows.map(mapOrder);
}

export async function updateOrderPaid(id: string, paid: boolean, client?: pg.PoolClient): Promise<void> {
  await (client ?? getPool()).query("UPDATE orders SET paid = $2 WHERE id = $1", [id, paid]);
}

export async function updateOrderVoided(id: string, voided: boolean, client?: pg.PoolClient): Promise<void> {
  await (client ?? getPool()).query("UPDATE orders SET voided = $2 WHERE id = $1", [id, voided]);
}

export async function updateOrderRefunded(id: string, client?: pg.PoolClient): Promise<void> {
  await (client ?? getPool()).query("UPDATE orders SET refunded = TRUE, paid = FALSE WHERE id = $1", [id]);
}

export async function nextCounterToken(): Promise<number> {
  const { rows } = await getPool().query<{ next_value: number }>(
    "UPDATE app_counters SET next_value = next_value + 1 WHERE key = 'counter_token' RETURNING next_value"
  );
  if (!rows[0]) {
    await getPool().query(
      "INSERT INTO app_counters (key, next_value) VALUES ('counter_token', 1000) ON CONFLICT (key) DO NOTHING"
    );
    const retry = await getPool().query<{ next_value: number }>(
      "UPDATE app_counters SET next_value = next_value + 1 WHERE key = 'counter_token' RETURNING next_value"
    );
    if (!retry.rows[0]) throw new Error("Counter queue not configured");
    return retry.rows[0].next_value;
  }
  return rows[0].next_value;
}

export async function insertReceipt(rec: {
  id: string;
  orderId: string;
  receiptNumber: string;
  total: number;
  paymentMode: string;
  whatsapp: string | null;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO receipts (id, order_id, receipt_number, total, payment_mode, whatsapp) VALUES ($1,$2,$3,$4,$5,$6)`,
    [rec.id, rec.orderId, rec.receiptNumber, rec.total, rec.paymentMode, rec.whatsapp]
  );
}

export async function listReceipts() {
  const { rows } = await getPool().query("SELECT * FROM receipts ORDER BY created_at DESC LIMIT 500");
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    receiptNumber: r.receipt_number,
    total: Number(r.total),
    paymentMode: r.payment_mode,
    whatsapp: r.whatsapp,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

export async function getReceiptByOrderId(orderId: string) {
  const { rows } = await getPool().query<{
    receipt_number: string;
    total: string;
    payment_mode: string;
    created_at: Date;
  }>("SELECT receipt_number, total, payment_mode, created_at FROM receipts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1", [
    orderId
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    receiptNumber: row.receipt_number,
    total: Number(row.total),
    paymentMode: row.payment_mode,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function markExitTokenUsed(tokenHash: string): Promise<void> {
  await getPool().query(
    "INSERT INTO exit_tokens_used (token_hash) VALUES ($1) ON CONFLICT DO NOTHING",
    [tokenHash]
  );
}

export async function isExitTokenUsed(tokenHash: string): Promise<boolean> {
  const { rows } = await getPool().query("SELECT 1 FROM exit_tokens_used WHERE token_hash = $1 LIMIT 1", [tokenHash]);
  return rows.length > 0;
}

export async function getMetrics(storeCode?: string) {
  const params: unknown[] = [];
  let filter = "WHERE voided = FALSE";
  if (storeCode) {
    filter += " AND store_code = $1";
    params.push(storeCode);
  }
  const { rows: orderRows } = await getPool().query<{
    paid: boolean;
    refunded: boolean;
    voided: boolean;
    total: string;
  }>(`SELECT paid, refunded, voided, total FROM orders ${filter}`, params);

  const products = await listProducts();
  const discountMap = await getDiscountMap();

  const paid = orderRows.filter((o) => o.paid && !o.refunded && !o.voided);
  const pending = orderRows.filter((o) => !o.paid && !o.voided && !o.refunded);
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0);
  const pendingValue = pending.reduce((s, o) => s + Number(o.total), 0);

  return {
    orderCount: orderRows.filter((o) => !o.voided).length,
    paidOrderCount: paid.length,
    openOrderCount: pending.length,
    totalRevenue: round2(revenue),
    pendingOrderValue: round2(pendingValue),
    averagePaidOrderValue: round2(paid.length ? revenue / paid.length : 0),
    productCount: products.length,
    lowStockSkuCount: products.filter((p) => p.availableQty < p.reorderLevel).length,
    inventoryValueAtCost: round2(products.reduce((s, p) => s + p.costPrice * p.inStock, 0)),
    inventoryValueAtList: round2(products.reduce((s, p) => s + p.unitPrice * p.inStock, 0)),
    reservedUnitsTotal: products.reduce((s, p) => s + p.reservedQty, 0),
    activeDiscountCount: discountMap.size
  };
}

export function shelfUnitPrice(p: Product, discountPct: number): number {
  const d = Math.min(100, Math.max(0, discountPct));
  return round2(p.unitPrice * (1 - d / 100));
}

export function profitPerUnit(p: Product, unitSell: number): number {
  return round2(unitSell - p.costPrice);
}
