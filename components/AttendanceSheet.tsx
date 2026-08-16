"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceStatus } from "@/types";

const OPTIONS: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "present", label: "Hadir", active: "bg-emerald-600 text-white border-emerald-600" },
  { value: "excused", label: "Izin", active: "bg-amber-500 text-white border-amber-500" },
  { value: "sick", label: "Sakit", active: "bg-sky-500 text-white border-sky-500" },
  { value: "absent", label: "Alpa", active: "bg-red-600 text-white border-red-600" },
];

export default function AttendanceSheet({
  sessionId,
  athletes,
  initial,
}: {
  sessionId: string;
  athletes: { id: string; name: string }[];
  initial: Record<string, string>;
}) {
  const supabase = createClient();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(
    initial as Record<string, AttendanceStatus>
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const s = { present: 0, excused: 0, sick: 0, absent: 0, unmarked: 0 };
    for (const a of athletes) {
      const m = marks[a.id];
      if (!m) s.unmarked++;
      else s[m]++;
    }
    return s;
  }, [marks, athletes]);

  function mark(id: string, status: AttendanceStatus) {
    setMarks((m) => ({ ...m, [id]: status }));
  }

  function markAll(status: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {};
    for (const a of athletes) next[a.id] = status;
    setMarks(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const rows = Object.entries(marks).map(([athlete_id, status]) => ({
        session_id: sessionId,
        athlete_id,
        status,
        recorded_by: user?.id ?? null,
      }));

      if (rows.length === 0) throw new Error("Belum ada atlet yang ditandai");

      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "session_id,athlete_id" });
      if (error) throw error;

      setSavedAt(new Date().toLocaleTimeString("id-ID"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Ringkasan:</span>
        <span className="badge bg-emerald-100 text-emerald-700">Hadir {summary.present}</span>
        <span className="badge bg-amber-100 text-amber-700">Izin {summary.excused}</span>
        <span className="badge bg-sky-100 text-sky-700">Sakit {summary.sick}</span>
        <span className="badge bg-red-100 text-red-700">Alpa {summary.absent}</span>
        {summary.unmarked > 0 && (
          <span className="badge bg-slate-100 text-slate-600">Belum {summary.unmarked}</span>
        )}
        <button
          type="button"
          onClick={() => markAll("present")}
          className="ml-auto text-sm font-medium text-brand-700 hover:underline"
        >
          Tandai semua hadir
        </button>
      </div>

      <div className="space-y-2">
        {athletes.length === 0 && (
          <div className="card text-center text-sm text-slate-500">
            Tidak ada atlet aktif di kelompok ini.
          </div>
        )}
        {athletes.map((a) => (
          <div key={a.id} className="card p-3">
            <p className="mb-2 font-medium text-slate-800">{a.name}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {OPTIONS.map((o) => {
                const active = marks[a.id] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => mark(a.id, o.value)}
                    className={`min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? o.active
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {savedAt && !error && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ Tersimpan pukul {savedAt}
        </p>
      )}

      <div className="sticky bottom-20 lg:bottom-4">
        <button
          onClick={save}
          disabled={saving || athletes.length === 0}
          className="btn-primary w-full py-3 text-base shadow-lg"
        >
          {saving ? "Menyimpan..." : "Simpan Absensi"}
        </button>
      </div>
    </div>
  );
}
