import type { Metadata } from "next";
import { getAuth } from "@/lib/supabase/auth-helper";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import type { Role } from "@/types";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getAuth();

  if (!user) redirect("/login");

  if (!profile || ["INACTIVE", "SUSPENDED", "DELETED"].includes(profile.account_status)) redirect("/login?error=account_inactive");

  const role: Role = (profile.role as Role) ?? "parent";
  const name = profile?.full_name || user.email || "Pengguna";

  return (
    <div className="workspace-shell">
      <Sidebar role={role} userName={name} />
      <div className="min-w-0 flex-1">
        <AppHeader role={role} userName={name} />
        <main id="main-content" className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
