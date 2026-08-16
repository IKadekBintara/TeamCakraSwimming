import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_LABELS } from "@/types";
import ExportButtons from "@/components/ExportButtons";

export const dynamic = "force-dynamic";

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();
  const now = new Date();
  const from = searchParams.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = searchParams.to ?? now.toISOString().slice(0, 10);

  const { data: sessions } = await supabase
    .from("training_sessions")
    .select("id, session_date, training_groups(name)")
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: false });

  const sessionIds = (sessions ?? []).map((s) => s.id);

  const { data: attendance } = sessionIds.length
    ? await supabase
        .from("attendance")
        .select("session_id, status, athletes(full_name)")
        .in("session_id", sessionIds)
    : { data: [] as never[] };

  // Per-athlete recap
  const recap: Record<string, { name: string; present: number; excused: number; sick: number; absent: number }> = {};
  for (const a of attendance ?? []) {
    const name = (a.athletes as { full_name?: string } | null)?.full_name ?? "—";
    if (!recap[name]) recap[name] = { name, present: 0, excused: 0, sick: 0, absent: 0 };
    const key = a.status as "present" | "excused" | "sick" | "absent";
    recap[name][key]++;
  }
  const recapRows = Object.values(recap).sort((a, b) => a.name.localeCompare(b.name));

  const totalSessions = sessions?.length ?? 0;
  const totalMarks = attendance?.length ?? 0;
  const totalPresent = (attendance ?? []).filter((a) => a.status === "present").length;
  const rate = totalMarks > 0 ? Math.round((totalPresent / totalMarks) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Laporan</h1>
        <p className="text-sm text-slate-500">Rekap kehadiran per periode</p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Dari</label>
          <input type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="label">Sampai</label>
          <input type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button className="btn-primary" type="submit">Terapkan</button>
        <ExportButtons from={from} to={to} />
      </form>

      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-700">{totalSessions}</p>
          <p className="text-xs text-slate-500">Sesi Latihan</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-700">{totalMarks}</p>
          <p className="text-xs text-slate-500">Total Catatan</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-brand-700">{rate}%</p>
          <p className="text-xs text-slate-500">Tingkat Kehadiran</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">Atlet</th>
              <th className="px-4 py-3 text-center">{ATTENDANCE_LABELS.present}</th>
              <th className="px-4 py-3 text-center">{ATTENDANCE_LABELS.excused}</th>
              <th className="px-4 py-3 text-center">{ATTENDANCE_LABELS.sick}</th>
              <th className="px-4 py-3 text-center">{ATTENDANCE_LABELS.absent}</th>
              <th className="px-4 py-3 text-center">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recapRows.map((r) => {
              const t = r.present + r.excused + r.sick + r.absent;
              const p = t > 0 ? Math.round((r.present / t) * 100) : 0;
              return (
                <tr key={r.name}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-center text-emerald-700">{r.present}</td>
                  <td className="px-4 py-2.5 text-center text-amber-700">{r.excused}</td>
                  <td className="px-4 py-2.5 text-center text-sky-700">{r.sick}</td>
                  <td className="px-4 py-2.5 text-center text-red-700">{r.absent}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-brand-700">{p}%</td>
                </tr>
              );
            })}
            {recapRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Tidak ada data pada periode ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
