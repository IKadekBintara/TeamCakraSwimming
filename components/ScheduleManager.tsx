"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DAY_NAMES } from "@/types";

interface Schedule {
  id: string;
  group_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  is_active: boolean;
}

export default function ScheduleManager({
  groupId,
  schedules,
}: {
  groupId: string;
  schedules: Schedule[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ day_of_week: 0, start_time: "07:00", end_time: "09:00", location: "" });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.from("training_schedules").insert({
      group_id: groupId,
      day_of_week: Number(form.day_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location || null,
    });
    setForm({ day_of_week: 0, start_time: "07:00", end_time: "09:00", location: "" });
    setBusy(false);
    router.refresh();
  }

  async function toggle(s: Schedule) {
    setBusy(true);
    await supabase.from("training_schedules").update({ is_active: !s.is_active }).eq("id", s.id);
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await supabase.from("training_schedules").delete().eq("id", id);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
        Jadwal ({schedules.length})
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {schedules.map((s) => (
          <li key={s.id} className={`flex items-center gap-2 px-3 py-2 ${s.is_active ? "" : "opacity-50"}`}>
            <span className="flex-1 text-slate-700">
              {DAY_NAMES[s.day_of_week]} • {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
              {s.location ? ` • ${s.location}` : ""}
            </span>
            <button onClick={() => toggle(s)} disabled={busy} className="text-xs font-medium text-slate-500 hover:underline">
              {s.is_active ? "Nonaktifkan" : "Aktifkan"}
            </button>
            <button onClick={() => remove(s.id)} disabled={busy} className="text-xs font-medium text-red-600 hover:underline">
              Hapus
            </button>
          </li>
        ))}
        {schedules.length === 0 && (
          <li className="px-3 py-3 text-center text-xs text-slate-400">Belum ada jadwal.</li>
        )}
      </ul>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2 sm:grid-cols-5">
        <select className="input" value={form.day_of_week} onChange={(e) => setForm((f) => ({ ...f, day_of_week: Number(e.target.value) }))}>
          {DAY_NAMES.map((d, i) => (
            <option key={i} value={i}>{d}</option>
          ))}
        </select>
        <input type="time" className="input" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
        <input type="time" className="input" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
        <input className="input" placeholder="Lokasi" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        <button disabled={busy} className="btn-primary text-sm">+ Jadwal</button>
      </form>
    </div>
  );
}
