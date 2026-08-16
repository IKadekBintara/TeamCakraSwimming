import { createBrowserClient } from "@supabase/ssr";

// Placeholder dipakai hanya agar build/prerender tidak gagal saat env belum diisi.
// Permintaan nyata akan gagal sampai .env.local dikonfigurasi dengan benar.
const FALLBACK_URL = "https://placeholder.supabase.co";
const FALLBACK_KEY = "placeholder-anon-key";

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && key && !url.includes("YOUR_PROJECT"));
  return {
    url: configured ? url! : FALLBACK_URL,
    key: configured ? key! : FALLBACK_KEY,
    configured,
  };
}

export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
