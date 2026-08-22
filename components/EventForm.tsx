"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EventForm() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", event_date: "", location: "", registration_deadline: "", fee_per_entry: "0", admin_fee: "0", description: "", status: "DRAFT" });
  const set = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    if (!form.name.trim() || !form.event_date) { setError("Nama event dan tanggal wajib diisi."); setSaving(false); return; }
    if (form.registration_deadline && form.registration_deadline > form.event_date) { setError("Deadline tidak boleh setelah tanggal event."); setSaving(false); return; }
    if (Number(form.fee_per_entry) < 0 || Number(form.admin_fee) < 0) { setError("Biaya tidak boleh negatif."); setSaving(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sesi login berakhir."); setSaving(false); return; }
    const { data, error: insertError } = await supabase.from("events").insert({
      ...form,
      fee_per_entry: Number(form.fee_per_entry),
      admin_fee: Number(form.admin_fee),
      registration_deadline: form.registration_deadline || null,
      created_by: user.id,
    }).select("id").single();
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    await supabase.from("audit_logs").insert({ actor_id: user.id, action: "create_event", entity: "events", entity_id: data.id, new_value: form });
    router.push(`/events/${data.id}`); router.refresh();
  }

  return <form onSubmit={submit} className="card space-y-4">
    <h2 className="text-lg font-semibold">Buat Event</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label sm:col-span-2">Nama Event<input className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dolphin Fun Swim 2026" /></label>
      <label className="label">Tanggal<input className="input" required type="date" value={form.event_date} onChange={(e) => set("event_date", e.target.value)} /></label>
      <label className="label">Deadline<input className="input" type="date" value={form.registration_deadline} onChange={(e) => set("registration_deadline", e.target.value)} /></label>
      <label className="label sm:col-span-2">Lokasi<input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} /></label>
      <label className="label">Biaya / nomor<input className="input" required min="0" type="number" value={form.fee_per_entry} onChange={(e) => set("fee_per_entry", e.target.value)} /></label>
      <label className="label">Biaya admin / nomor<input className="input" required min="0" type="number" value={form.admin_fee} onChange={(e) => set("admin_fee", e.target.value)} /></label>
      <label className="label sm:col-span-2">Status<select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}><option>DRAFT</option><option>OPEN</option><option>CLOSED</option><option>ARCHIVED</option></select></label>
      <label className="label sm:col-span-2">Deskripsi<textarea className="input" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
    </div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <button disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Buat Event"}</button>
  </form>;
}
