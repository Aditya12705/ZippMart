import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required — set your Supabase Postgres connection string in services/api/.env");
  }
  if (url.includes("[YOUR-PASSWORD]") || url.includes("[password]")) {
    throw new Error("Replace [YOUR-PASSWORD] in services/api/.env with your Supabase database password");
  }
  pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000
  });
  return pool;
}

export async function verifyDb(): Promise<void> {
  const p = getPool();
  await p.query("SELECT 1");
  await p.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INT NOT NULL DEFAULT 10");

  try {
    // 1. Delete all products that are not fashion-related (e.g. Snacks, Personal Care, General etc.)
    await p.query(`
      DELETE FROM products 
      WHERE category NOT IN ('Apparel', 'Outerwear', 'Accessories')
    `);

    // 2. Fetch store id
    const storeRes = await p.query("SELECT id FROM stores LIMIT 1");
    if (storeRes.rows.length > 0) {
      const storeId = storeRes.rows[0].id;

      // 3. Insert fresh fashion seeds if catalogue is empty or has < 3 products
      const countRes = await p.query("SELECT COUNT(*) FROM products");
      const count = parseInt(countRes.rows[0].count, 10);
      if (count < 3) {
        console.log("Seeding fashion products...");
        const fashionSeeds = [
          {
            barcode: "8901234567890",
            sku: "PF-LINEN-SH-M",
            name: "Linen Summer Shirt",
            category: "Apparel",
            unit_price: 2499.00,
            cost_price: 1200.00,
            style_code: "PF-LINEN-SH-01",
            size: "M",
            color: "Off-White",
            brand: "ProFlo Atelier",
            season: "Summer",
            gender: "Unisex",
            image_url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80",
            in_stock: 45,
            demand_score: 85
          },
          {
            barcode: "8901234567891",
            sku: "PF-SILK-BL-S",
            name: "Silk Cropped Blouse",
            category: "Apparel",
            unit_price: 3999.00,
            cost_price: 1800.00,
            style_code: "PF-SILK-BL-02",
            size: "S",
            color: "Emerald Green",
            brand: "ProFlo Atelier",
            season: "All Season",
            gender: "Women",
            image_url: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=500&q=80",
            in_stock: 25,
            demand_score: 95
          },
          {
            barcode: "8901234567892",
            sku: "PF-TROUSER-L",
            name: "High-Waisted Trousers",
            category: "Apparel",
            unit_price: 3499.00,
            cost_price: 1500.00,
            style_code: "PF-TROUSER-03",
            size: "L",
            color: "Burgundy",
            brand: "ProFlo Tailored",
            season: "Autumn",
            gender: "Women",
            image_url: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=500&q=80",
            in_stock: 30,
            demand_score: 90
          },
          {
            barcode: "8901234567893",
            sku: "PF-JACKET-XL",
            name: "Classic Leather Jacket",
            category: "Outerwear",
            unit_price: 7999.00,
            cost_price: 3500.00,
            style_code: "PF-JACKET-04",
            size: "XL",
            color: "Midnight Black",
            brand: "ProFlo Leather",
            season: "Winter",
            gender: "Men",
            image_url: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&q=80",
            in_stock: 15,
            demand_score: 80
          },
          {
            barcode: "8901234567894",
            sku: "PF-SKIRT-M",
            name: "Pleated Midi Skirt",
            category: "Apparel",
            unit_price: 2299.00,
            cost_price: 1100.00,
            style_code: "PF-SKIRT-05",
            size: "M",
            color: "Taupe",
            brand: "ProFlo Atelier",
            season: "Spring",
            gender: "Women",
            image_url: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=500&q=80",
            in_stock: 35,
            demand_score: 75
          },
          {
            barcode: "8901234567895",
            sku: "PF-DENIM-M",
            name: "Premium Denim Jeans",
            category: "Apparel",
            unit_price: 2999.00,
            cost_price: 1400.00,
            style_code: "PF-DENIM-06",
            size: "M",
            color: "Indigo Blue",
            brand: "ProFlo Denim",
            season: "All Season",
            gender: "Unisex",
            image_url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&q=80",
            in_stock: 50,
            demand_score: 88
          },
          {
            barcode: "8901234567896",
            sku: "PF-KNIT-L",
            name: "Knitted Turtleneck Sweater",
            category: "Apparel",
            unit_price: 3299.00,
            cost_price: 1600.00,
            style_code: "PF-KNIT-07",
            size: "L",
            color: "Camel",
            brand: "ProFlo Knitwear",
            season: "Winter",
            gender: "Unisex",
            image_url: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=500&q=80",
            in_stock: 40,
            demand_score: 92
          }
        ];

        for (const item of fashionSeeds) {
          await p.query(
            `INSERT INTO products (
              store_id, barcode, sku, name, category, unit_price, cost_price, 
              style_code, size, color, brand, season, gender, image_url, in_stock, demand_score
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (store_id, barcode) DO NOTHING`,
            [
              storeId, item.barcode, item.sku, item.name, item.category, item.unit_price, item.cost_price,
              item.style_code, item.size, item.color, item.brand, item.season, item.gender, item.image_url, item.in_stock, item.demand_score
            ]
          );
        }
        console.log("Fashion seeds successfully populated!");
      }
    }
  } catch (err) {
    console.error("Failed to seed database with fashion items:", err);
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
