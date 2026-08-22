"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calculateDolphinKu, rupiah } from "@/lib/events";

interface Race { id: string; name: string; allowed_kus: string[]; is_relay: boolean; }
interface Athlete { id: string; full_name: string; birth_date: string | null; cakra: string | null; }

export default function EventRegistrationForm({ event, races, athletes }: { event: { id: string; status: string; fee_per_entry: number; admin_fee: number }; races: Race[]; athletes: Athlete[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [athleteId, setAthleteId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [kuOverride, setKuOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const athlete = athletes.find((a) => a.id === athleteId);
  const ku = athlete ? calculateDolphinKu(athlete.birth_date) : "—";
  const effectiveKu = kuOverride || ku;
  const availableRaces = useMemo(() => races.filter((r) => r.allowed_kus.length === 0 || r.allowed_kus.includes(effectiveKu)), [races, effectiveKu]);
  const total = selected.length * (Number(event.fee_per_entry) + Number(event.admin_fee));

  function toggle(id: string) { setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!athlete || selected.length === 0) { setError("Pilih atlet dan minimal satu nomor lomba."); return; }
    if (event.status !== "OPEN") { setError("Event belum berstatus OPEN."); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sesi login berakhir."); setSaving(false); return; }
    const { data: registration, error: regError } = await supabase.from("event_registrations").insert({ event_id: event.id, athlete_id: athlete.id, ku, ku_override: kuOverride || null, registered_by: user.id }).select("id").single();
    if (regError) { setError(regError.code === "23505" ? "Atlet sudah memiliki pendaftaran pada event ini." : regError.message); setSaving(false); return; }
    const { error: entryError } = await supabase.from("event_registration_entries").insert(selected.map((race_id) => ({ registration_id: registration.id, race_id })));
    if (entryError) { setError(entryError.message); setSaving(false); return; }
    const { error: paymentError } = await supabase.from("event_payments").insert({ athlete_id: athlete.id, event_id: event.id, registration_id: registration.id, athlete_name: athlete.full_name, cakra: athlete.cakra, jumlah_nomor: selected.length, registration_fee: selected.length * Number(event.fee_per_entry), admin_fee: selected.length * Number(event.admin_fee), total_amount: total, amount_paid: 0, remaining_amount: total, payment_status: "BELUM_BAYAR", submitted_by: user.id });
    if (paymentError) { setError(paymentError.message); setSaving(false); return; }
    await supabase.from("audit_logs").insert({ actor_id: user.id, action: "create_event_registration", entity: "event_registrations", entity_id: registration.id, new_value: { event_id: event.id, athlete_id: athlete.id, race_ids: selected, ku: effectiveKu } });
    router.refresh(); setAthleteId(""); setSelected([]); setKuOverride(""); setSaving(false);
  }

  return <form onSubmit={submit} className="card space-y-4">
    <div><h2 className="text-lg font-semibold">Pendaftaran Atlet</h2><p className="text-sm text-slate-500">KU dihitung otomatis dari tanggal lahir. Override hanya jika diperlukan admin.</p></div>
    <label className="label">Atlet<select className="input" required value={athleteId} onChange={(e) => { setAthleteId(e.target.value); setSelected([]); }}><option value="">Pilih atlet...</option>{athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="text-slate-500">KU otomatis</span><p className="font-semibold text-brand-700">{ku}</p></div><label className="label">Override KU (opsional)<input className="input" value={kuOverride} onChange={(e) => { setKuOverride(e.target.value); setSelected([]); }} placeholder="Kosongkan jika otomatis" /></label></div>
    <fieldset><legend className="label mb-2">Nomor lomba</legend><div className="grid gap-2 sm:grid-cols-2">{availableRaces.map((race) => <label key={race.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={selected.includes(race.id)} onChange={() => toggle(race.id)} />{race.name}{race.is_relay ? " (Estafet)" : ""}</label>)}</div>{availableRaces.length === 0 && <p className="text-sm text-amber-700">Tidak ada nomor yang sesuai KU ini.</p>}</fieldset>
    <div className="rounded-lg bg-brand-50 p-3 text-sm"><div className="flex justify-between"><span>Jumlah nomor</span><strong>{selected.length}</strong></div><div className="flex justify-between"><span>Total tagihan</span><strong>{rupiah(total)}</strong></div></div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <button disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Simpan Pendaftaran"}</button>
  </form>;
}
