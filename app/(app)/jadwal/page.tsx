import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES } from "@/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function JadwalPage() {
  const supabase = createClient();

  const { data: schedules } = await supabase
    .from("training_schedules")
    .select("id, day_of_week, start_time, end_time, location, is_active, training_groups(name, is_active, coaches(full_name))")
    .order("day_of_week")
    .order("start_time");

  const byDay: Record<number, NonNullable<typeof schedules>> = {};
  for (const s of schedules ?? []) {
    if (!byDay[s.day_of_week]) byDay[s.day_of_week] = [];
    byDay[s.day_of_week].push(s);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pt-14 lg:pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jadwal Latihan</h1>
          <p className="text-sm text-slate-500">Jadwal mingguan seluruh kelompok</p>
        </div>
        <Link href="/kelompok" className="btn-secondary text-sm">Kelola Jadwal</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DAY_NAMES.map((day, i) => (
          <div key={i} className="card">
            <h2 className="mb-2 font-semibold text-brand-800">{day}</h2>
            {(byDay[i] ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada jadwal</p>
            ) : (
              <ul className="space-y-2">
                {(byDay[i] ?? []).map((s) => {
                  const g = s.training_groups as {
                    name?: string; is_active?: boolean;
                    coaches?: { full_name?: string } | null;
                  } | null;
                  return (
                    <li
                      key={s.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        s.is_active && g?.is_active
                          ? "border-brand-200 bg-brand-50"
                          : "border-slate-200 bg-slate-50 opacity-60"
                      }`}
                    >
                      <p className="font-medium text-slate-800">{g?.name ?? "—"}</p>
                      <p className="text-slate-600">
                        {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                      </p>
                      {s.location && <p className="text-xs text-slate-500">{s.location}</p>}
                      <p className="text-xs text-slate-400">{g?.coaches?.full_name ?? ""}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
