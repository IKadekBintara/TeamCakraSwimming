import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/** Ambil profil user login; null bila tidak ada sesi. */
export async function getProfile() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, account_status")
    .eq("id", user.id)
    .maybeSingle();
  return profile;
}

/** Halaman staf: role athlete/parent ditendang kembali ke dashboard. */
export async function requireStaff() {
  const profile = await getProfile();
  const role = (profile?.role as string | undefined) ?? "";
  if (!["admin", "operator", "coach", "group_leader", "ketua_kelompok"].includes(role)) redirect("/dashboard");
  return profile!;
}
