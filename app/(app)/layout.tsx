import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { Role } from "@/types";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const role: Role = (profile?.role as Role) ?? "parent";
  const name = profile?.full_name || user.email || "Pengguna";

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} userName={name} />
      <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6 lg:pb-6">
        {children}
      </main>
    </div>
  );
}
