"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface CoachOpt { id: string; full_name: string }
interface GroupData {
  id: string; name: string; location: string | null;
  coach_id: string | null; leader_id: string | null; is_active: boolean;
}

export default function GroupForm({
  coaches,
  leaders,
  group,
  compact = false,
}: {
  coaches: CoachOpt[];
  leaders: CoachOpt[];
  group?: GroupData;
  compact?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: group?.name ?? "",
    location: group?.location ?? "",
    coach_id: group?.coach_id ?? "",
    leader_id: group?.leader_id ?? "",
    is_active: group?.is_active ?? true,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      location: form.location || null,
      coach_id: form.coach_id || null,
      leader_id: form.leader_id || null,
      is_active: form.is_active,
    };
    try {
      if (group) {
        const { error } = await supabase.from("training_groups").update(payload).eq("id", group.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "update_group", entity: "training_groups", entity_id: group.id, new_value: payload,
        });
      } else {
        const { data, error } = await supabase.from("training_groups").insert(payload).select("id").single();
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "create_group", entity: "training_groups", entity_id: data.id, new_value: payload,
        });
      }
      setOpen(false);
      if (!group) setForm({ name: "", location: "", coach_id: "", leader_id: "", is_active: true });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  const fields = (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="label">Nama Kelompok *</label>
        <input className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="mis. Team Cakra 4" />
      </div>
      <div>
        <label className="label">Lokasi</label>
        <input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="mis. Kolam Renang ABC" />
      </div>
      <div>
        <label className="label">Pelatih</label>
        <select className="input" value={form.coach_id} onChange={(e) => set("coach_id", e.target.value)}>
          <option value="">—</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Ketua Kelompok</label>
        <select className="input" value={form.leader_id} onChange={(e) => set("leader_id", e.target.value)}>
          <option value="">—</option>
          {leaders.map((l) => (
            <option key={l.id} value={l.id}>{l.full_name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        Kelompok aktif
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? "Menyimpan..." : group ? "Simpan" : "Tambah"}
        </button>
        {group && (
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
            Tutup
          </button>
        )}
      </div>
    </form>
  );

  if (compact) {
    return (
      <div className="shrink-0">
        {!open ? (
          <button onClick={() => setOpen(true)} className="btn-secondary text-sm">Edit</button>
        ) : (
          <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
            <div className="card max-h-[85vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 font-semibold">Edit Kelompok</h3>
              {fields}
            </div>
          </div>
        )}
      </div>
    );
  }

  return fields;
}
