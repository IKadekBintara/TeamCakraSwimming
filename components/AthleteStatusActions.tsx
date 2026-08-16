"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AthleteStatus } from "@/types";

export default function AthleteStatusActions({
  athleteId,
  status,
}: {
  athleteId: string;
  status: AthleteStatus;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<null | "left" | "reactivate">(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftAt, setLeftAt] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  async function markLeft(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("athletes")
        .update({
          status: "LEFT_CLUB",
          left_at: leftAt,
          left_reason: reason || null,
          notes: notes ? notes : undefined,
        })
        .eq("id", athleteId);
      if (error) throw error;

      // Tutup keanggotaan aktif
      await supabase
        .from("training_group_members")
        .update({ left_at: today })
        .eq("athlete_id", athleteId)
        .is("left_at", null);

      await supabase.from("audit_logs").insert({
        action: "mark_left_club",
        entity: "athletes",
        entity_id: athleteId,
        new_value: { left_at: leftAt, left_reason: reason },
      });

      setMode(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSaving(false);
    }
  }

  async function reactivate() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("athletes")
        .update({
          status: "ACTIVE",
          reactivated_at: new Date().toISOString().slice(0, 10),
        })
        .eq("id", athleteId);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        action: "reactivate_athlete",
        entity: "athletes",
        entity_id: athleteId,
        old_value: { status: "LEFT_CLUB" },
        new_value: { status: "ACTIVE" },
      });

      setMode(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "left") {
    return (
      <form onSubmit={markLeft} className="card space-y-3 border-amber-200 bg-amber-50/50">
        <h3 className="font-semibold text-amber-900">Tandai Keluar dari Klub</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Tanggal Keluar *</label>
            <input type="date" required className="input" value={leftAt} onChange={(e) => setLeftAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Alasan</label>
            <input className="input" placeholder="mis. Pindah klub" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Catatan (opsional)</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-amber-700">
          Riwayat absensi & profil tetap tersimpan. Atlet akan hilang dari daftar absensi aktif.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-danger">
            {saving ? "Memproses..." : "Konfirmasi Keluar"}
          </button>
          <button type="button" onClick={() => setMode(null)} className="btn-secondary">Batal</button>
        </div>
      </form>
    );
  }

  if (mode === "reactivate") {
    return (
      <div className="card space-y-3 border-emerald-200 bg-emerald-50/50">
        <h3 className="font-semibold text-emerald-900">Reaktivasi Atlet</h3>
        <p className="text-sm text-slate-600">
          Atlet akan kembali berstatus Aktif. Seluruh riwayat lama dipertahankan.
          Tetapkan kembali kelompoknya lewat tombol Edit setelah reaktivasi.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button onClick={reactivate} disabled={saving} className="btn-primary">
            {saving ? "Memproses..." : "Konfirmasi Reaktivasi"}
          </button>
          <button onClick={() => setMode(null)} className="btn-secondary">Batal</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {status !== "LEFT_CLUB" ? (
        <button onClick={() => setMode("left")} className="btn-secondary text-sm text-amber-700">
          Tandai Keluar
        </button>
      ) : (
        <button onClick={() => setMode("reactivate")} className="btn-primary text-sm">
          Reaktivasi Atlet
        </button>
      )}
    </div>
  );
}
