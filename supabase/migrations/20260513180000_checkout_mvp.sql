-- Supermart checkout MVP — single source of truth (no seed products)
-- Safe to run in Supabase SQL Editor. Choose "Run and enable RLS" if prompted.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

INSERT INTO stores (code, name)
VALUES ('BLR001', 'Main store')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  unit_price NUMERIC(12, 2) NOT NULL,
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 5,
  in_stock INT NOT NULL DEFAULT 0,
  demand_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, barcode)
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_products_store_active ON products (store_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);

CREATE TABLE IF NOT EXISTS product_discounts (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  discount_percent INT NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 90),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE product_discounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  store_code TEXT NOT NULL,
  customer_phone TEXT,
  cart JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sessions_phone ON customer_sessions (customer_phone);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON customer_sessions (expires_at);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES customer_sessions(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  store_code TEXT NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL,
  tax_total NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  lines JSONB NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('ONLINE', 'COUNTER')),
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  token_number INT,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  refunded BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_email TEXT,
  receipt_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (store_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_token ON orders (token_number) WHERE token_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL UNIQUE,
  total NUMERIC(12, 2) NOT NULL,
  payment_mode TEXT NOT NULL,
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at DESC);

CREATE TABLE IF NOT EXISTS exit_tokens_used (
  token_hash TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE exit_tokens_used ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app_counters (
  key TEXT PRIMARY KEY,
  next_value INT NOT NULL
);
ALTER TABLE app_counters ENABLE ROW LEVEL SECURITY;

INSERT INTO app_counters (key, next_value) VALUES ('counter_token', 1000)
ON CONFLICT (key) DO NOTHING;

-- Public read only for catalogue browsing in customer-web (anon key).
-- All other tables: RLS on, no anon policies → blocked from browser clients.
-- The Express API uses DATABASE_URL (postgres role) and bypasses RLS.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_public_read'
  ) THEN
    CREATE POLICY products_public_read ON products
      FOR SELECT TO anon, authenticated
      USING (is_active = TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stores' AND policyname = 'stores_public_read'
  ) THEN
    CREATE POLICY stores_public_read ON stores
      FOR SELECT TO anon, authenticated
      USING (TRUE);
  END IF;
END $$;
