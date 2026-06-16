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
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
