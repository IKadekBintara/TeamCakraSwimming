"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AthleteStatus } from "@/types";

/**
 * Tandai Keluar / Reaktivasi atlet.
 * Sejak 0024: aksi ini juga mencabut/memulihkan akses akun via
 * PATCH /api/admin/athlete-accounts (account disable/enable + signOut global),
 * dengan audit log ATHLETE_MARKED_INACTIVE / ATHLETE_REACTIVATED di server.
 */
export default function AthleteStatusActions({
  athleteId,
  status,
}: {
  athleteId: string;
  status: AthleteStatus;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "left" | "reactivate">(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftAt, setLeftAt] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  async function submit(action: "mark_left" | "reactivate") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/athlete-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId, action, left_at: leftAt, left_reason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Operasi gagal");
      setMode(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "left") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); submit("mark_left"); }} className="card w-full space-y-3 border-amber-200 bg-amber-50/50 sm:max-w-md">
        <h3 className="font-semibold text-amber-900">Tandai Atlet Ini Sebagai Keluar?</h3>
        <div className="grid gap-3">
          <div>
            <label className="label">Tanggal Keluar *</label>
            <input type="date" required className="input" value={leftAt} onChange={(e) => setLeftAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Alasan</label>
            <input className="input" placeholder="mis. Pindah klub" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700">
          <li>Akun login atlet akan dinonaktifkan dan sesi aktif dicabut.</li>
          <li>Atlet tidak dapat mengakses sistem selama berstatus keluar.</li>
          <li>Seluruh data historis tetap disimpan dan dapat dibuka admin.</li>
          <li>Atlet tidak akan muncul lagi sebagai atlet aktif.</li>
          <li>Registrasi event &amp; absensi baru tidak dapat dibuat.</li>
        </ul>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-danger">
            {saving ? "Memproses..." : "Tandai Keluar"}
          </button>
          <button type="button" onClick={() => setMode(null)} className="btn-secondary">Batal</button>
        </div>
      </form>
    );
  }

  if (mode === "reactivate") {
    return (
      <div className="card w-full space-y-3 border-emerald-200 bg-emerald-50/50 sm:max-w-md">
        <h3 className="font-semibold text-emerald-900">Aktifkan Kembali Atlet</h3>
        <p className="text-sm text-slate-600">
          Atlet kembali berstatus Aktif dan akunnya diaktifkan ulang (bisa login lagi).
          Data historis tidak dibuat ulang — athlete record yang sama yang dipakai.
          Tetapkan kembali kelompoknya lewat tombol Edit setelah reaktivasi.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => submit("reactivate")} disabled={saving} className="btn-primary">
            {saving ? "Memproses..." : "Konfirmasi Reaktivasi"}
          </button>
          <button onClick={() => setMode(null)} className="btn-secondary">Batal</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {status !== "LEFT_CLUB" && status !== "INACTIVE" ? (
        <button onClick={() => setMode("left")} className="btn-secondary text-sm text-amber-700">
          Tandai Keluar
        </button>
      ) : (
        <button onClick={() => setMode("reactivate")} className="btn-primary text-sm">
          Aktifkan Kembali
        </button>
      )}
    </div>
  );
}
