import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const PRODUCT_IMAGES_BUCKET = "product-images";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isProductImageStorageConfigured(): boolean {
  return supabaseAdmin() !== null;
}

export async function uploadProductImageToStorage(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<string> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Supabase Storage is not configured on the API");

  const objectPath = `${randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(PRODUCT_IMAGES_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: false,
    cacheControl: "31536000"
  });
  if (error) throw new Error(error.message);

  const { data } = sb.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}
