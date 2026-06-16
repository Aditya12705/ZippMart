-- Event-sourced stock ledger + soft reservations for carts and unpaid orders

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  qty_after INT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('INITIAL', 'SALE', 'REFUND', 'ADJUSTMENT', 'CORRECTION')),
  ref_type TEXT,
  ref_id TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_at ON stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_at ON stock_movements (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  session_id UUID REFERENCES customer_sessions(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  qty INT NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'committed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (session_id IS NOT NULL AND order_id IS NULL)
    OR (session_id IS NULL AND order_id IS NOT NULL)
  )
);
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_active
  ON stock_reservations (product_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_stock_reservations_session_active
  ON stock_reservations (session_id)
  WHERE status = 'active' AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_reservations_order_active
  ON stock_reservations (order_id)
  WHERE status = 'active' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires
  ON stock_reservations (expires_at)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_session_product_active
  ON stock_reservations (session_id, product_id)
  WHERE status = 'active' AND session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_order_product_active
  ON stock_reservations (order_id, product_id)
  WHERE status = 'active' AND order_id IS NOT NULL;

-- Backfill ledger rows for existing on-hand stock (one row per SKU with qty > 0)
INSERT INTO stock_movements (store_id, product_id, delta, qty_after, reason, ref_type, actor, note)
SELECT p.store_id, p.id, p.in_stock, p.in_stock, 'INITIAL', 'migration', 'system', 'Backfill from legacy in_stock counter'
FROM products p
WHERE p.in_stock > 0
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm WHERE sm.product_id = p.id
  );
