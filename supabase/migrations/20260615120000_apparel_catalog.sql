-- ProFlo apparel catalog — variant attributes on flat SKU rows
-- Each size/color combination remains one product row with its own barcode.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS style_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS season TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'Unisex';

CREATE INDEX IF NOT EXISTS idx_products_style_code ON products (store_id, style_code) WHERE style_code <> '';
CREATE INDEX IF NOT EXISTS idx_products_size ON products (store_id, size) WHERE size <> '';
CREATE INDEX IF NOT EXISTS idx_products_color ON products (store_id, color) WHERE color <> '';

UPDATE stores SET name = 'ProFlo Flagship' WHERE code = 'BLR001' AND name = 'Main store';
