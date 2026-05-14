export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type RecommendationProduct = {
  id: string;
  barcode?: string;
  name: string;
  /** Selling unit price after discount (what customer pays before tax) */
  unitPrice: number;
  /** List / MSRP before discount */
  listPrice?: number;
  /** 0–100 when on promotion */
  discountPercent?: number;
  category?: string;
  demandScore?: number;
  imageUrl?: string;
  taxPercent?: number;
  inStock?: number;
};
