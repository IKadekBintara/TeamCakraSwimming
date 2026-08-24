import { redirect } from "next/navigation";
import { getProfile } from "@/lib/page-guard";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/** Guard server halaman admin: Sinkronisasi Excel.
 *  PENTING: layout HARUS me-render children — return null membuat Next.js
 *  menelan seluruh konten page di bawahnya (blank white page). */
export default async function ExcelSyncLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  return <>{children}</>;
}
