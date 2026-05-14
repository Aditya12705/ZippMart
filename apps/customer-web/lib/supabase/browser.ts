import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

function supabasePublicKey(): string | undefined {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return anon || publishable;
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return Boolean(url && supabasePublicKey());
}

export function getSupabaseBrowser(): SupabaseClient | null {
  if (browserClient === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = supabasePublicKey();
    if (!url || !key) {
      browserClient = null;
    } else {
      browserClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
  }
  return browserClient;
}
