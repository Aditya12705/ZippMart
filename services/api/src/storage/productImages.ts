import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const PRODUCT_IMAGES_BUCKET = "product-images";

function assertServiceRoleKey(key: string): void {
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is a publishable (anon) key. In Supabase → Settings → API, copy the service_role secret (not the publishable key)."
    );
  }
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  try {
    assertServiceRoleKey(key);
  } catch {
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function productImageStorageStatus(): {
  configured: boolean;
  hint?: string;
} {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    return {
      configured: false,
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API (HF Space secrets)."
    };
  }
  if (key.startsWith("sb_publishable_")) {
    return {
      configured: false,
      hint: "SUPABASE_SERVICE_ROLE_KEY must be the service_role secret, not the publishable key."
    };
  }
  return { configured: true };
}

export function isProductImageStorageConfigured(): boolean {
  return supabaseAdmin() !== null;
}

export async function uploadProductImageToStorage(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<string> {
  const status = productImageStorageStatus();
  if (!status.configured) {
    throw new Error(status.hint ?? "Supabase Storage is not configured on the API");
  }
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
