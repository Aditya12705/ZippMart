CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id),
  sku TEXT NOT NULL,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  in_stock INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, barcode)
);

CREATE TABLE customer_sessions (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  customer_phone TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL UNIQUE REFERENCES customer_sessions(id),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES carts(id),
  product_id UUID NOT NULL REFERENCES products(id),
  qty INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  tax_percent NUMERIC(5,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  UNIQUE (cart_id, product_id)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL UNIQUE REFERENCES customer_sessions(id),
  order_number TEXT UNIQUE NOT NULL,
  payment_mode TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE counter_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  token_number INT NOT NULL,
  status TEXT NOT NULL,
  served_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  receipt_number TEXT NOT NULL UNIQUE,
  receipt_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE receipt_dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES receipts(id),
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exit_passes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  qr_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE gate_scan_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exit_pass_id UUID REFERENCES exit_passes(id),
  gate_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
