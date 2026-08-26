import { cache } from "react";
import { createClient } from "./server";

/**
 * Auth + profil per-request dengan React `cache()`.
 * Layout dan halaman dalam request yang sama berbagi SATU panggilan
 * getUser() ke Supabase — bukan 3–4 round-trip berurutan per klik menu.
 */
export const getAuth = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
});
