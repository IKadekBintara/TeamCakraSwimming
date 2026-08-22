import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EventForm from "@/components/EventForm";
import { rupiah } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = createClient();
  const [{ data: events }, { data: profile }] = await Promise.all([
    supabase.from("events").select("id, name, event_date, location, description, contact_person, contact_whatsapp, payment_instructions, fee_per_entry, admin_fee, status, registration_deadline").order("event_date", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle(),
  ]);
  const canManage = profile?.role === "admin";
  return <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0">
    <div><h1 className="text-2xl font-bold">Events</h1><p className="text-sm text-slate-500">Kelola event dan pendaftaran TEAM CAKRA SWIMMING.</p></div>
    {canManage && <EventForm />}
    <div className="grid gap-4 md:grid-cols-2">
      {(events ?? []).map((event) => <Link key={event.id} href={`/events/${event.id}`} className="card block transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand-200"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{event.name}</h2><p className="mt-1 text-sm text-slate-500">{event.event_date} · {event.location || "Lokasi belum diatur"}</p></div><span className={`badge ${event.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : event.status === "DRAFT" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{event.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-500">Biaya / nomor</p><p className="font-semibold">{rupiah(event.fee_per_entry)}</p></div><div><p className="text-slate-500">Admin / nomor</p><p className="font-semibold">{rupiah(event.admin_fee)}</p></div></div></Link>)}
    </div>
    {(events ?? []).length === 0 && <div className="card text-sm text-slate-500">Belum ada event. Admin dapat membuat event melalui Event Settings.</div>}
  </div>;
}
