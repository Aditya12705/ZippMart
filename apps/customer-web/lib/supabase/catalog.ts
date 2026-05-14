import type { RecommendationProduct } from "../../app/shop/lib/shopConfig";
import { apiBase } from "../../lib/apiBase";
import { resolveProductImageUrl } from "../../lib/productImage";
import { getSupabaseBrowser } from "./browser";

const DEFAULT_TABLE = "products";

export type CatalogRow = {
  id: string;
  name: string;
  barcode: string | null;
  unit_price: number | string | null;
  category: string | null;
  image_url: string | null;
};

function tableName(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_PRODUCTS_TABLE ?? DEFAULT_TABLE).trim() || DEFAULT_TABLE;
}

function mapRow(row: CatalogRow): RecommendationProduct {
  const price = row.unit_price != null ? Number(row.unit_price) : 0;
  return {
    id: String(row.id),
    barcode: row.barcode ?? undefined,
    name: String(row.name ?? ""),
    unitPrice: Number.isFinite(price) ? price : 0,
    category: row.category ?? undefined,
    imageUrl: row.image_url?.trim() ? resolveProductImageUrl(row.image_url.trim()) : undefined
  };
}

function escapeIlike(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ");
}

export async function fetchCatalogFromSupabase(
  search?: string,
  rowLimit = 200
): Promise<RecommendationProduct[]> {
  const sb = getSupabaseBrowser();
  if (!sb) return [];

  const table = tableName();
  const term = search != null ? search.trim() : "";
  const wild = term ? `%${escapeIlike(term)}%` : null;

  let q = sb
    .from(table)
    .select("id,name,barcode,unit_price,category,image_url")
    .order("name", { ascending: true })
    .limit(Math.min(Math.max(rowLimit, 1), 500));

  if (wild) {
    q = q.or(`name.ilike.${wild},barcode.ilike.${wild}`);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[catalog] Supabase:", error.message);
    return [];
  }
  return ((data ?? []) as CatalogRow[]).map(mapRow).filter((p) => p.name);
}

export async function fetchCatalogFromApi(q?: string): Promise<RecommendationProduct[]> {
  try {
    const url = q?.trim()
      ? `${apiBase}/v1/customer/products?q=${encodeURIComponent(q.trim())}`
      : `${apiBase}/v1/customer/products`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = (await resp.json()) as Array<{
      id: string;
      barcode?: string;
      name: string;
      unitPrice: number;
      listPrice?: number;
      discountPercent?: number;
      category?: string;
      taxPercent?: number;
      inStock?: number;
      demandScore?: number;
      imageUrl?: string;
    }>;
    return data.map((p) => ({
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      unitPrice: p.unitPrice,
      listPrice: p.listPrice,
      discountPercent: p.discountPercent,
      category: p.category,
      taxPercent: p.taxPercent,
      inStock: p.inStock,
      demandScore: p.demandScore,
      imageUrl: p.imageUrl?.trim() ? resolveProductImageUrl(p.imageUrl.trim()) : undefined
    }));
  } catch {
    return [];
  }
}

function mergeApiWithSupabase(
  apiRows: RecommendationProduct[],
  dbRows: RecommendationProduct[]
): RecommendationProduct[] {
  const byBarcode = new Map<string, RecommendationProduct>();
  for (const p of dbRows) {
    const b = p.barcode?.trim();
    if (b) byBarcode.set(b, p);
  }
  return apiRows.map((row) => {
    const b = row.barcode?.trim();
    if (!b) return row;
    const extra = byBarcode.get(b);
    if (!extra) return row;
    return {
      ...row,
      imageUrl: extra.imageUrl ?? row.imageUrl,
      category: extra.category ?? row.category
    };
  });
}

export async function fetchCatalogUnified(search?: string): Promise<RecommendationProduct[]> {
  const apiRows = await fetchCatalogFromApi(search);
  const sb = getSupabaseBrowser();
  if (!sb) {
    return apiRows;
  }
  const fromDb = await fetchCatalogFromSupabase(search, 200);
  if (apiRows.length === 0) {
    return fromDb;
  }
  if (fromDb.length === 0) {
    return apiRows;
  }
  return mergeApiWithSupabase(apiRows, fromDb);
}

/** Typeahead only: no query → no rows. Merges API + Supabase like unified search, capped for UX. */
export async function fetchBrowseSuggestions(query: string, limit = 12): Promise<RecommendationProduct[]> {
  const t = query.trim();
  if (!t) return [];

  const apiRows = await fetchCatalogFromApi(t);
  const sb = getSupabaseBrowser();
  const cap = Math.min(Math.max(limit, 1), 40);

  if (!sb) {
    return apiRows.slice(0, cap);
  }

  const fromDb = await fetchCatalogFromSupabase(t, cap);
  let merged: RecommendationProduct[];
  if (apiRows.length === 0) {
    merged = fromDb;
  } else if (fromDb.length === 0) {
    merged = apiRows;
  } else {
    merged = mergeApiWithSupabase(apiRows, fromDb);
  }
  return merged.slice(0, cap);
}
