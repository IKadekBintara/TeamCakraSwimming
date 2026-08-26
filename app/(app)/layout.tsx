import type { Metadata } from "next";
import { getAuth } from "@/lib/supabase/auth-helper";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import NotificationBell from "@/components/NotificationBell";
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
    <div className="flex min-h-screen">
      <Sidebar role={role} userName={name} />
      <main className="relative flex-1 overflow-x-hidden p-4 pb-24 md:p-6 lg:pb-6">
        {/* Bell di desktop: pojok kanan atas konten. Di mobile bell pindah ke top-bar (Sidebar) */}
        <div className="absolute right-4 top-4 z-40 hidden md:right-6 md:top-6 lg:block">
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}
