import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventRegistrationForm from "@/components/EventRegistrationForm";
import PaymentProofForm from "@/components/PaymentProofForm";
import RelayTeamForm from "@/components/RelayTeamForm";
import EventStatusActions from "@/components/EventStatusActions";
import { rupiah } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  const canManage = profile?.role === "admin" || profile?.role === "operator";
  const canRegister = canManage || profile?.role === "parent" || profile?.role === "athlete";
  const [{ data: event }, { data: races }, { data: athletes }, { data: memberships }, { data: registrations }] = await Promise.all([
    supabase.from("events").select("id,name,event_date,location,description,registration_deadline,fee_per_entry,admin_fee,status").eq("id", params.id).single(),
    supabase.from("event_races").select("id,name,allowed_kus,is_relay,sort_order").eq("event_id", params.id).eq("is_active", true).order("sort_order"),
    supabase.from("athletes").select("id,full_name,birth_date").eq("status", "ACTIVE").order("full_name"),
    supabase.from("training_group_members").select("athlete_id,training_groups(name)").is("left_at", null),
    supabase.from("event_registrations").select("id,athlete_id,ku,ku_override,status,athletes(full_name),event_registration_entries(event_races(name)),event_payments(id,payment_status,total_amount,amount_paid,remaining_amount,payment_proof,payment_method)").eq("event_id", params.id).order("created_at", { ascending: false }),
  ]);
  if (!event) notFound();

  const cakraOf = new Map<string, string>();
  for (const m of memberships ?? []) cakraOf.set(m.athlete_id, (m.training_groups as { name?: string } | null)?.name ?? "");
  const formAthletes = (athletes ?? []).map((a) => ({ ...a, cakra: cakraOf.get(a.id) ?? null }));

  return <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0">
    <Link href="/events" className="text-sm text-brand-700 hover:underline">← Semua Events</Link>
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{event.name}</h1><p className="mt-1 text-sm text-slate-500">{event.event_date} · {event.location || "Lokasi belum diatur"}</p></div><div className="flex flex-col items-end gap-2"><span className={`badge ${event.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{event.status}</span>{canManage && <EventStatusActions eventId={event.id} status={event.status} />}</div></div>
      <p className="mt-4 text-sm text-slate-600">{event.description || "Tidak ada deskripsi."}</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><span>Biaya nomor: <strong>{rupiah(event.fee_per_entry)}</strong></span><span>Admin: <strong>{rupiah(event.admin_fee)}</strong></span><span>Deadline: <strong>{event.registration_deadline || "—"}</strong></span></div>
    </div>
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      {canRegister && <EventRegistrationForm event={event} races={races ?? []} athletes={formAthletes} canManage={canManage} />}
      {canRegister && <RelayTeamForm eventId={event.id} races={races ?? []} athletes={formAthletes} />}
      <div className="card overflow-x-auto"><h2 className="mb-3 text-lg font-semibold">Nomor Lomba</h2><table className="w-full min-w-[500px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="px-2 py-2">Nomor</th><th className="px-2 py-2">KU</th><th className="px-2 py-2">Tipe</th></tr></thead><tbody className="divide-y">{(races ?? []).map((r) => <tr key={r.id}><td className="px-2 py-2 font-medium">{r.name}</td><td className="px-2 py-2 text-slate-600">{r.allowed_kus.join(", ") || "Semua"}</td><td className="px-2 py-2">{r.is_relay ? "Estafet" : "Individu"}</td></tr>)}</tbody></table></div>
    </div>
    <div className="card overflow-x-auto"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Pendaftaran Event</h2><Link href="/keuangan" className="text-sm text-brand-700 hover:underline">Lihat Keuangan →</Link></div><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="px-2 py-2">Atlet</th><th className="px-2 py-2">KU</th><th className="px-2 py-2">Nomor</th><th className="px-2 py-2">Payment</th><th className="px-2 py-2">Tagihan</th></tr></thead><tbody className="divide-y">{(registrations ?? []).map((r) => { const p = Array.isArray(r.event_payments) ? r.event_payments[0] : r.event_payments; const entries = (r.event_registration_entries ?? []).map((e) => (e.event_races as { name?: string } | null)?.name).filter(Boolean).join(", "); return <tr key={r.id}><td className="px-2 py-2 font-medium">{(r.athletes as { full_name?: string } | null)?.full_name}</td><td className="px-2 py-2">{r.ku_override || r.ku}</td><td className="px-2 py-2">{entries || "—"}</td><td className="px-2 py-2"><span className="badge bg-slate-100 text-slate-700">{p?.payment_status || "—"}</span></td><td className="px-2 py-2">{rupiah(p?.total_amount)}</td></tr>; })}</tbody></table>{(registrations ?? []).length === 0 && <p className="text-sm text-slate-500">Belum ada pendaftaran.</p>}</div>
    {canRegister && <div className="space-y-3">{(registrations ?? []).map((r) => { const p = Array.isArray(r.event_payments) ? r.event_payments[0] : r.event_payments; return p ? <PaymentProofForm key={r.id} paymentId={p.id} currentAmount={Number(p.amount_paid || 0)} totalAmount={Number(p.total_amount || 0)} status={String(p.payment_status)} /> : null; })}</div>}
  </div>;
}
