import { redirect } from "next/navigation";
import { getProfile } from "@/lib/page-guard";

export const dynamic = "force-dynamic";

/** Halaman admin: Sinkronisasi Excel (pusat kontrol automation). */
export default async function ExcelSyncLayout() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  return null;
}
