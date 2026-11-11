import { getAuth } from "@/lib/supabase/auth-helper";
import { redirect } from "next/navigation";

/** Ambil profil user login; null bila tidak ada sesi. */
export async function getProfile() {
  const { profile } = await getAuth();
  return profile;
}

/** Halaman staf: role athlete/parent ditendang kembali ke dashboard. */
export async function requireStaff() {
  const profile = await getProfile();
  const role = (profile?.role as string | undefined) ?? "";
  if (!["admin", "operator", "coach", "group_leader", "ketua_kelompok"].includes(role)) redirect("/dashboard");
  return profile!;
}
