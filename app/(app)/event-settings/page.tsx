import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/supabase/auth-helper";
import EventSettings from "@/components/EventSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event Settings" };

export default async function EventSettingsPage() {
  const supabase = createClient();
  const { user } = await getAuth();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role,account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") redirect("/events");
  const { data: events } = await supabase.from("events").select("id,name,event_date,location,description,registration_deadline,status,fee_per_entry,admin_fee,contact_person,contact_whatsapp,payment_instructions").order("event_date", { ascending: false });
  return <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0"><div><h1 className="text-2xl font-bold">Event Settings</h1><p className="text-sm text-slate-500">Atur event, nomor lomba, KU, harga, status gratis, dan instruksi pembayaran.</p></div><EventSettings events={events ?? []} /></div>;
}
