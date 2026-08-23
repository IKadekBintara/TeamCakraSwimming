"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STROKES, formatTime } from "@/lib/performance";

type Athlete = { id: string; full_name: string };
type EventOpt = { id: string; name: string };

export default function PerformanceResultForm({
  athletes,
  events,
  canDelete = false,
  editResult,
}: {
  athletes: Athlete[];
  events: EventOpt[];
  canDelete?: boolean;
  editResult?: {
    id: string;
    athlete_id: string;
    athlete_name?: string;
    recorded_at: string;
    stroke: string;
    distance: number;
    time_cs: number | null;
    pool_length: number | null;
    meet_name: string | null;
    notes: string | null;
    rank: number | null;
  } | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(!!editResult);

  const [form, setForm] = useState({
    athlete_id: editResult?.athlete_id ?? "",
    recorded_at: editResult?.recorded_at ?? new Date().toISOString().slice(0, 10),
    stroke: editResult?.stroke ?? "Freestyle",
    distance: String(editResult?.distance ?? 50),
    time: editResult?.time_cs != null ? formatTime(editResult.time_cs) : "",
    pool_length: editResult?.pool_length ? String(editResult.pool_length) : "25",
    event_id: "",
    meet_name: editResult?.meet_name ?? "",
    notes: editResult?.notes ?? "",
    rank: editResult?.rank ? String(editResult.rank) : "",
  });

  const distances = useMemo(() => {
    const base = [50, 100, 200];
    const cur = Number(form.distance);
    if (!base.includes(cur) && cur > 0) return [...base, cur].sort((a, b) => a - b);
    return base;
  }, [form.distance]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        athlete_id: form.athlete_id,
        recorded_at: form.recorded_at,
        stroke: form.stroke,
        distance: Number(form.distance),
        time: form.time,
        pool_length: form.pool_length ? Number(form.pool_length) : null,
        meet_name: form.meet_name,
        notes: form.notes,
        rank: form.rank ? Number(form.rank) : null,
      };
      let res: Response;
      if (editing && editResult) {
        res = await fetch("/api/performance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editResult.id, ...payload }),
        });
      } else {
        delete payload.rank;
        res = await fetch("/api/performance", {
          mode: "same-origin",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan hasil");
      setMsg({ ok: true, text: editing ? "✓ Hasil diperbarui" : "✓ Hasil tersimpan" });
      if (!editing) setForm({ ...form, time: "", meet_name: "", notes: "", rank: "" });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: `✗ ${err instanceof Error ? err.message : "Gagal menyimpan"}` });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editResult) return;
    if (!window.confirm("Hapus hasil ini? Tindakan tercatat di audit log.")) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/performance?id=${encodeURIComponent(editResult.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      setMsg({ ok: true, text: "✓ Hasil dihapus" });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: `✗ ${err instanceof Error ? err.message : "Gagal menghapus"}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="label sm:col-span-2">Atlet
        <select className="input" value={form.athlete_id} onChange={(e) => setForm({ ...form, athlete_id: e.target.value })} required disabled={editing}>
          <option value="">Pilih atlet…</option>
          {athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
      </label>
      <label className="label">Tanggal
        <input className="input" type="date" value={form.recorded_at} onChange={(e) => setForm({ ...form, recorded_at: e.target.value })} required />
      </label>
      <label className="label">Stroke
        <select className="input" value={form.stroke} onChange={(e) => setForm({ ...form, stroke: e.target.value })}>
          {STROKES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="label">Distance (m)
        <input className="input" list="perf-distances" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} inputMode="numeric" required />
        <datalist id="perf-distances">
          {distances.map((d) => <option key={d} value={d} />)}
        </datalist>
      </label>
      <label className="label">Waktu (detik)
        <input className="input" placeholder="36.21 atau 1:23.45" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
      </label>
      <label className="label">Panjang Kolam
        <select className="input" value={form.pool_length} onChange={(e) => setForm({ ...form, pool_length: e.target.value })}>
          <option value="25">25 m</option>
          <option value="50">50 m</option>
        </select>
      </label>
      {!editing && (
        <label className="label">Event / Kompetisi (opsional)
          <select className="input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
            <option value="">— Tanpa event —</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </label>
      )}
      <label className="label">Nama Meet (opsional)
        <input className="input" value={form.meet_name} onChange={(e) => setForm({ ...form, meet_name: e.target.value })} placeholder="Misal: Piala Walikota" />
      </label>
      {editing && (
        <label className="label">Ranking (opsional)
          <input className="input" inputMode="numeric" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
        </label>
      )}
      <label className="label sm:col-span-2 lg:col-span-4">Catatan (opsional)
        <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={busy || !form.athlete_id} className="btn-primary">
          {busy ? "Menyimpan…" : editing ? "Simpan Perubahan" : "+ Catat Hasil"}
        </button>
        {editing && canDelete && (
          <button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            Hapus Hasil
          </button>
        )}
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
