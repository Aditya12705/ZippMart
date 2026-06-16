import type pg from "pg";
import { getPool } from "./pool";

export type StockMovementReason = "INITIAL" | "SALE" | "REFUND" | "ADJUSTMENT" | "CORRECTION";

export type StockMovement = {
  id: string;
  productId: string;
  productName?: string;
  barcode?: string;
  delta: number;
  qtyAfter: number;
  reason: StockMovementReason;
  refType: string | null;
  refId: string | null;
  actor: string;
  note: string;
  createdAt: string;
};

export class InsufficientStockError extends Error {
  constructor(
    public productId: string,
    message = "Not enough stock for this quantity"
  ) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class ConcurrentStockError extends Error {
  constructor(message = "Stock changed concurrently — please retry") {
    super(message);
    this.name = "ConcurrentStockError";
  }
}

export type DbQueryable = pg.Pool | pg.PoolClient;

function db(client?: pg.PoolClient): DbQueryable {
  return client ?? getPool();
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function releaseExpiredReservations(client?: pg.PoolClient): Promise<number> {
  const { rowCount } = await db(client).query(
    `UPDATE stock_reservations
     SET status = 'released', updated_at = NOW()
     WHERE status = 'active' AND expires_at <= NOW()`
  );
  return rowCount ?? 0;
}

export async function getReservedQty(
  productId: string,
  opts?: { excludeSessionId?: string; excludeOrderId?: string },
  client?: pg.PoolClient
): Promise<number> {
  const params: unknown[] = [productId];
  let sql = `SELECT COALESCE(SUM(qty), 0)::int AS reserved
             FROM stock_reservations
             WHERE product_id = $1 AND status = 'active'`;
  if (opts?.excludeSessionId) {
    params.push(opts.excludeSessionId);
    sql += ` AND (session_id IS NULL OR session_id <> $${params.length})`;
  }
  if (opts?.excludeOrderId) {
    params.push(opts.excludeOrderId);
    sql += ` AND (order_id IS NULL OR order_id <> $${params.length})`;
  }
  const { rows } = await db(client).query<{ reserved: number }>(sql, params);
  return rows[0]?.reserved ?? 0;
}

export async function getAvailableQty(
  productId: string,
  excludeSessionId?: string,
  client?: pg.PoolClient
): Promise<number> {
  const { rows } = await db(client).query<{ in_stock: number }>(
    "SELECT in_stock FROM products WHERE id = $1 AND is_active = TRUE LIMIT 1",
    [productId]
  );
  const onHand = rows[0]?.in_stock;
  if (onHand == null) return 0;
  const reserved = await getReservedQty(productId, { excludeSessionId }, client);
  return Math.max(0, onHand - reserved);
}

async function insertMovement(
  client: pg.PoolClient,
  input: {
    storeId: string;
    productId: string;
    delta: number;
    qtyAfter: number;
    reason: StockMovementReason;
    refType?: string | null;
    refId?: string | null;
    actor: string;
    note?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO stock_movements (store_id, product_id, delta, qty_after, reason, ref_type, ref_id, actor, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.storeId,
      input.productId,
      input.delta,
      input.qtyAfter,
      input.reason,
      input.refType ?? null,
      input.refId ?? null,
      input.actor,
      (input.note ?? "").slice(0, 500)
    ]
  );
}

export async function syncSessionReservations(
  sessionId: string,
  storeId: string,
  cart: Map<string, number>,
  expiresAt: Date,
  client?: pg.PoolClient
): Promise<void> {
  const run = async (c: pg.PoolClient) => {
    await releaseExpiredReservations(c);

    const activeProductIds = [...cart.entries()].filter(([, qty]) => qty > 0).map(([id]) => id);

    if (activeProductIds.length === 0) {
      await c.query(
        `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
         WHERE session_id = $1 AND status = 'active'`,
        [sessionId]
      );
      return;
    }

    for (const [productId, qty] of cart) {
      if (qty <= 0) continue;
      const available = await getAvailableQty(productId, sessionId, c);
      if (qty > available) throw new InsufficientStockError(productId);

      await c.query(
        `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
         WHERE session_id = $1 AND product_id = $2 AND status = 'active'`,
        [sessionId, productId]
      );
      await c.query(
        `INSERT INTO stock_reservations (store_id, product_id, session_id, qty, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [storeId, productId, sessionId, qty, expiresAt.toISOString()]
      );
    }

    await c.query(
      `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
       WHERE session_id = $1 AND status = 'active' AND NOT (product_id = ANY($2::uuid[]))`,
      [sessionId, activeProductIds]
    );
  };

  if (client) return run(client);
  return withTransaction(run);
}

export async function reserveOrderFromSession(
  sessionId: string,
  orderId: string,
  storeId: string,
  lines: Array<{ productId: string; qty: number }>,
  holdUntil: Date,
  client: pg.PoolClient
): Promise<void> {
  await releaseExpiredReservations(client);

  for (const line of lines) {
    const available = await getAvailableQty(line.productId, sessionId, client);
    if (line.qty > available) throw new InsufficientStockError(line.productId);

    await client.query(
      `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
       WHERE session_id = $1 AND product_id = $2 AND status = 'active'`,
      [sessionId, line.productId]
    );
    await client.query(
      `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
       WHERE order_id = $1 AND product_id = $2 AND status = 'active'`,
      [orderId, line.productId]
    );
    await client.query(
      `INSERT INTO stock_reservations (store_id, product_id, order_id, qty, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [storeId, line.productId, orderId, line.qty, holdUntil.toISOString()]
    );
  }

  await client.query(
    `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
     WHERE session_id = $1 AND status = 'active'`,
    [sessionId]
  );
}

export async function releaseOrderReservations(orderId: string, client?: pg.PoolClient): Promise<void> {
  await db(client).query(
    `UPDATE stock_reservations SET status = 'released', updated_at = NOW()
     WHERE order_id = $1 AND status = 'active'`,
    [orderId]
  );
}

export async function commitSale(
  orderId: string,
  lines: Array<{ productId: string; qty: number }>,
  actor: string,
  client?: pg.PoolClient
): Promise<void> {
  const run = async (c: pg.PoolClient) => {
    for (const line of lines) {
      const { rows } = await c.query<{ in_stock: number; stock_version: number; store_id: string }>(
        `SELECT in_stock, stock_version, store_id FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
        [line.productId]
      );
      const product = rows[0];
      if (!product) throw new InsufficientStockError(line.productId, "Product not found");
      if (product.in_stock < line.qty) throw new InsufficientStockError(line.productId);

      const qtyAfter = product.in_stock - line.qty;
      const { rowCount } = await c.query(
        `UPDATE products
         SET in_stock = $2, stock_version = stock_version + 1
         WHERE id = $1 AND stock_version = $3 AND in_stock >= $4`,
        [line.productId, qtyAfter, product.stock_version, line.qty]
      );
      if (!rowCount) throw new ConcurrentStockError();

      await insertMovement(c, {
        storeId: product.store_id,
        productId: line.productId,
        delta: -line.qty,
        qtyAfter,
        reason: "SALE",
        refType: "order",
        refId: orderId,
        actor,
        note: "Sale settlement"
      });

      await c.query(
        `UPDATE stock_reservations SET status = 'committed', updated_at = NOW()
         WHERE order_id = $1 AND product_id = $2 AND status = 'active'`,
        [orderId, line.productId]
      );
    }
  };

  if (client) return run(client);
  return withTransaction(run);
}

export async function restockRefund(
  orderId: string,
  lines: Array<{ productId: string; qty: number }>,
  actor: string,
  client?: pg.PoolClient
): Promise<void> {
  const run = async (c: pg.PoolClient) => {
    for (const line of lines) {
      const { rows } = await c.query<{ in_stock: number; store_id: string }>(
        `SELECT in_stock, store_id FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
        [line.productId]
      );
      const product = rows[0];
      if (!product) continue;

      const qtyAfter = product.in_stock + line.qty;
      await c.query(
        `UPDATE products SET in_stock = $2, stock_version = stock_version + 1 WHERE id = $1`,
        [line.productId, qtyAfter]
      );
      await insertMovement(c, {
        storeId: product.store_id,
        productId: line.productId,
        delta: line.qty,
        qtyAfter,
        reason: "REFUND",
        refType: "order",
        refId: orderId,
        actor,
        note: "Refund restock"
      });
    }
  };

  if (client) return run(client);
  return withTransaction(run);
}

export async function adjustProductStock(
  productId: string,
  newQty: number,
  actor: string,
  note: string,
  client?: pg.PoolClient
): Promise<{ inStock: number; delta: number }> {
  const run = async (c: pg.PoolClient) => {
    const { rows } = await c.query<{ in_stock: number; store_id: string }>(
      `SELECT in_stock, store_id FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
      [productId]
    );
    const product = rows[0];
    if (!product) throw new Error("Product not found");

    const reserved = await getReservedQty(productId, undefined, c);
    if (newQty < reserved) {
      throw new InsufficientStockError(
        productId,
        `Cannot set on-hand to ${newQty} — ${reserved} unit(s) are reserved in open carts or unpaid orders`
      );
    }

    const delta = newQty - product.in_stock;
    if (delta === 0) return { inStock: product.in_stock, delta: 0 };

    await c.query(`UPDATE products SET in_stock = $2, stock_version = stock_version + 1 WHERE id = $1`, [
      productId,
      newQty
    ]);

    await insertMovement(c, {
      storeId: product.store_id,
      productId,
      delta,
      qtyAfter: newQty,
      reason: "ADJUSTMENT",
      refType: "admin",
      refId: productId,
      actor,
      note: note || "Manual stock adjustment"
    });

    return { inStock: newQty, delta };
  };

  if (client) return run(client);
  return withTransaction(run);
}

export async function recordInitialStock(
  productId: string,
  storeId: string,
  qty: number,
  actor: string,
  client: pg.PoolClient
): Promise<void> {
  if (qty <= 0) return;
  await insertMovement(client, {
    storeId,
    productId,
    delta: qty,
    qtyAfter: qty,
    reason: "INITIAL",
    refType: "product",
    refId: productId,
    actor,
    note: "Opening stock on product create"
  });
}

export async function listStockMovements(limit: number, productId?: string): Promise<StockMovement[]> {
  const capped = Math.min(500, Math.max(1, limit));
  let sql = `SELECT sm.id, sm.product_id, sm.delta, sm.qty_after, sm.reason, sm.ref_type, sm.ref_id, sm.actor, sm.note, sm.created_at,
                    p.name AS product_name, p.barcode
             FROM stock_movements sm
             JOIN products p ON p.id = sm.product_id`;
  const params: unknown[] = [];
  if (productId) {
    sql += ` WHERE sm.product_id = $1`;
    params.push(productId);
  }
  sql += ` ORDER BY sm.created_at DESC LIMIT $${productId ? 2 : 1}`;
  params.push(capped);

  const { rows } = await getPool().query(sql, params);
  return rows.map((r) => ({
    id: r.id as string,
    productId: r.product_id as string,
    productName: r.product_name as string,
    barcode: r.barcode as string,
    delta: r.delta as number,
    qtyAfter: r.qty_after as number,
    reason: r.reason as StockMovementReason,
    refType: r.ref_type as string | null,
    refId: r.ref_id as string | null,
    actor: r.actor as string,
    note: r.note as string,
    createdAt: new Date(r.created_at as Date).toISOString()
  }));
}

export async function getReservationSummary(client?: pg.PoolClient): Promise<Map<string, number>> {
  const { rows } = await db(client).query<{ product_id: string; reserved: number }>(
    `SELECT product_id, COALESCE(SUM(qty), 0)::int AS reserved
     FROM stock_reservations
     WHERE status = 'active'
     GROUP BY product_id`
  );
  return new Map(rows.map((r) => [r.product_id, r.reserved]));
}
