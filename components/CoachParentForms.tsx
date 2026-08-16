"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CoachParentForms({
  coaches,
  parents,
  users,
}: {
  coaches: { id: string; full_name: string; user_id: string | null; whatsapp: string | null }[];
  parents: { id: string; full_name: string; user_id: string | null; whatsapp: string | null }[];
  users: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [coachForm, setCoachForm] = useState({ full_name: "", whatsapp: "", user_id: "" });
  const [parentForm, setParentForm] = useState({ full_name: "", whatsapp: "", user_id: "" });

  async function addCoach(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("coaches").insert({
        full_name: coachForm.full_name.trim(),
        whatsapp: coachForm.whatsapp || null,
        user_id: coachForm.user_id || null,
      });
      if (error) throw error;
      setMsg("✓ Pelatih ditambahkan");
      setCoachForm({ full_name: "", whatsapp: "", user_id: "" });
      router.refresh();
    } catch (err) {
      setMsg(`✗ ${err instanceof Error ? err.message : "Gagal"}`);
    } finally {
      setSaving(false);
    }
  }

  async function addParent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("parents").insert({
        full_name: parentForm.full_name.trim(),
        whatsapp: parentForm.whatsapp || null,
        user_id: parentForm.user_id || null,
      });
      if (error) throw error;
      setMsg("✓ Orang tua ditambahkan");
      setParentForm({ full_name: "", whatsapp: "", user_id: "" });
      router.refresh();
    } catch (err) {
      setMsg(`✗ ${err instanceof Error ? err.message : "Gagal"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="font-semibold">Pelatih ({coaches.length})</h2>
        <ul className="space-y-1 text-sm text-slate-600">
          {coaches.map((c) => (
            <li key={c.id} className="flex justify-between">
              <span>{c.full_name}</span>
              <span className="text-xs text-slate-400">{c.whatsapp ?? ""}</span>
            </li>
          ))}
          {coaches.length === 0 && <li className="text-slate-400">Belum ada pelatih.</li>}
        </ul>
        <form onSubmit={addCoach} className="space-y-2 border-t border-slate-100 pt-3">
          <input className="input" placeholder="Nama pelatih *" required value={coachForm.full_name} onChange={(e) => setCoachForm((f) => ({ ...f, full_name: e.target.value }))} />
          <input className="input" placeholder="WhatsApp" value={coachForm.whatsapp} onChange={(e) => setCoachForm((f) => ({ ...f, whatsapp: e.target.value }))} />
          <select className="input" value={coachForm.user_id} onChange={(e) => setCoachForm((f) => ({ ...f, user_id: e.target.value }))}>
            <option value="">— Tautkan akun login (opsional) —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
          <button disabled={saving} className="btn-primary w-full">Tambah Pelatih</button>
        </form>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Orang Tua ({parents.length})</h2>
        <ul className="space-y-1 text-sm text-slate-600">
          {parents.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.full_name}</span>
              <span className="text-xs text-slate-400">{p.whatsapp ?? ""}</span>
            </li>
          ))}
          {parents.length === 0 && <li className="text-slate-400">Belum ada orang tua.</li>}
        </ul>
        <form onSubmit={addParent} className="space-y-2 border-t border-slate-100 pt-3">
          <input className="input" placeholder="Nama orang tua *" required value={parentForm.full_name} onChange={(e) => setParentForm((f) => ({ ...f, full_name: e.target.value }))} />
          <input className="input" placeholder="WhatsApp" value={parentForm.whatsapp} onChange={(e) => setParentForm((f) => ({ ...f, whatsapp: e.target.value }))} />
          <select className="input" value={parentForm.user_id} onChange={(e) => setParentForm((f) => ({ ...f, user_id: e.target.value }))}>
            <option value="">— Tautkan akun login (opsional) —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
          <button disabled={saving} className="btn-primary w-full">Tambah Orang Tua</button>
        </form>
      </div>

      {msg && (
        <p className={`lg:col-span-2 rounded-lg px-3 py-2 text-sm ${msg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
