import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/supabase/auth-helper";
import AccountManagement from "@/components/AccountManagement";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account Management" };

export default async function AccountsPage() {
  const supabase = createClient();
  const { user } = await getAuth();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") redirect("/dashboard");
  return <div className="mx-auto max-w-7xl space-y-5 pt-14 lg:pt-0"><AccountManagement /></div>;
}
