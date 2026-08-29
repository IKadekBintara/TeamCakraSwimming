"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Athlete, AthleteStatus } from "@/types";

interface Option { id: string; name?: string; full_name?: string }

export default function AthleteForm({
  groups,
  parents,
  mode,
  athlete,
}: {
  groups: Option[];
  parents: Option[];
  mode: "create" | "edit";
  athlete?: Partial<Athlete> & { id?: string; current_group_id?: string | null };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: athlete?.full_name ?? "",
    nickname: athlete?.nickname ?? "",
    birth_date: athlete?.birth_date ?? "",
    gender: athlete?.gender ?? "",
    school: athlete?.school ?? "",
    grade: athlete?.grade ?? "",
    parent_id: athlete?.parent_id ?? "",
    parent_name: athlete?.parent_name ?? "",
    whatsapp: athlete?.whatsapp ?? "",
    address: athlete?.address ?? "",
    program: athlete?.program ?? "",
    group_id: athlete?.current_group_id ?? "",
    join_date: athlete?.join_date ?? new Date().toISOString().slice(0, 10),
    status: (athlete?.status ?? "ACTIVE") as AthleteStatus,
    notes: athlete?.notes ?? "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function syncMembership(athleteId: string, newGroupId: string) {
    const { data: current } = await supabase
      .from("training_group_members")
      .select("id, group_id")
      .eq("athlete_id", athleteId)
      .is("left_at", null)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);

    if (current && current.group_id !== newGroupId) {
      await supabase
        .from("training_group_members")
        .update({ left_at: today })
        .eq("id", current.id);
    }
    if (newGroupId && (!current || current.group_id !== newGroupId)) {
      await supabase
        .from("training_group_members")
        .insert({ group_id: newGroupId, athlete_id: athleteId, joined_at: today });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Validasi kelompok wajib diisi
    if (!form.group_id) {
      setError("Kelompok wajib dipilih.");
      setSaving(false);
      return;
    }

    const payload = {
      full_name: form.full_name.trim().toUpperCase(),
      nickname: form.nickname || null,
      birth_date: form.birth_date || null,
      gender: (form.gender || null) as "M" | "F" | null,
      school: form.school || null,
      grade: form.grade || null,
      parent_id: form.parent_id || null,
      parent_name: form.parent_name || null,
      whatsapp: form.whatsapp || null,
      address: form.address || null,
      program: form.program || null,
      join_date: form.join_date || null,
      status: form.status,
      notes: form.notes || null,
    };

    try {
      let athleteId: string;
      if (mode === "create") {
        const { data, error } = await supabase
          .from("athletes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        athleteId = data.id;
        await supabase.from("audit_logs").insert({
          action: "create_athlete", entity: "athletes", entity_id: athleteId, new_value: payload,
        });
      } else {
        athleteId = athlete!.id!;
        const { error } = await supabase.from("athletes").update(payload).eq("id", athleteId);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          action: "update_athlete", entity: "athletes", entity_id: athleteId, new_value: payload,
        });
        // Rename → sinkronkan snapshot athlete_name pada arsip pembayaran.
        // Identity tetap athlete_id; nama hanya atribut yang ikut diperbarui.
        if (payload.full_name && payload.full_name !== athlete!.full_name) {
          const { error: snapErr } = await supabase
            .from("event_payments")
            .update({ athlete_name: payload.full_name })
            .eq("athlete_id", athleteId);
          if (snapErr) {
            await supabase.from("audit_logs").insert({
              action: "athlete_snapshot_sync_failed", entity: "event_payments",
              entity_id: athleteId, old_value: { error: snapErr.message },
            });
          }
        }
      }

      if (form.status === "ACTIVE") {
        await syncMembership(athleteId, form.group_id);
      }

      // Siapkan akun login atlet secara otomatis (hanya berhasil bila pembuat adalah admin;
      // selain admin dibiarkan mengisi lewat "Sinkronkan/Buat Akun" di halaman detail).
      if (mode === "create") {
        try {
          const res = await fetch("/api/admin/athlete-accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ athlete_id: athleteId }),
          });
          if (!res.ok && res.status !== 403) {
            const data = await res.json().catch(() => null);
            setError(data?.error ? `Atlet tersimpan, tetapi akun belum dibuat: ${data.error}` : "Atlet tersimpan. Akun dapat dibuat dari halaman detail atlet.");
          }
        } catch {
          // Non-blocking: akun tetap bisa dibuat manual dari detail atlet.
        }
      }

      router.push(`/atlet/${athleteId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nama Lengkap *</label>
          <input className="input" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div>
          <label className="label">Nama Panggilan</label>
          <input className="input" value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />
        </div>
        <div>
          <label className="label">Tanggal Lahir</label>
          <input type="date" className="input" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
        </div>
        <div>
          <label className="label">Jenis Kelamin</label>
          <select className="input" value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            <option value="M">Laki-laki</option>
            <option value="F">Perempuan</option>
          </select>
        </div>
        <div>
          <label className="label">Sekolah</label>
          <input className="input" value={form.school ?? ""} onChange={(e) => set("school", e.target.value)} />
        </div>
        <div>
          <label className="label">Kelas</label>
          <input className="input" value={form.grade ?? ""} onChange={(e) => set("grade", e.target.value)} />
        </div>
        <div>
          <label className="label">Program</label>
          <input className="input" placeholder="mis. Athlete / Pemula" value={form.program ?? ""} onChange={(e) => set("program", e.target.value)} />
        </div>
        <div>
          <label className="label">Kelompok</label>
          <select className="input" value={form.group_id ?? ""} onChange={(e) => set("group_id", e.target.value)}>
            <option value="">Pilih kelompok</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Orang Tua (terdaftar)</label>
          <select className="input" value={form.parent_id ?? ""} onChange={(e) => set("parent_id", e.target.value)}>
            <option value="">— Pilih orang tua —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Nama Orang Tua (teks)</label>
          <input className="input" value={form.parent_name ?? ""} onChange={(e) => set("parent_name", e.target.value)} />
        </div>
        <div>
          <label className="label">Nomor WhatsApp</label>
          <input className="input" placeholder="08xxxxxxxxxx" value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Alamat</label>
          <textarea className="input" rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div>
          <label className="label">Tanggal Bergabung</label>
          <input type="date" className="input" value={form.join_date ?? ""} onChange={(e) => set("join_date", e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Nonaktif</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Catatan</label>
          <textarea className="input" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Menyimpan..." : mode === "create" ? "Simpan Atlet" : "Simpan Perubahan"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Batal
        </button>
      </div>
    </form>
  );
}