import { createClient } from "@supabase/supabase-js";

// Server-only client with elevated privileges. NEVER import this from client components.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js App Router meng-cache fetch GET secara default -> data basi.
    // Semua query service harus selalu fresh (pembayaran/event/status).
    global: {
      fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }),
    },
  });
}
