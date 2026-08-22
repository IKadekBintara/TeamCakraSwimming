import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ATTENDANCE_LABELS } from "@/types";

export const dynamic = "force-dynamic";

function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // Senin sebagai awal minggu
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  return s.toISOString().slice(0, 10);
}

export default async function AbsensiPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; group?: string };
}) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = startOfWeek(new Date());
  const from = searchParams.from ?? defaultFrom;
  const to = searchParams.to ?? today;
  const fGroup = searchParams.group ?? "ALL";

  const { data: groups } = await supabase
    .from("training_groups")
    .select("id, name, location, is_active")
    .eq("is_active", true)
    .order("name");

  // Sesi pada rentang
  let sessionQuery = supabase
    .from("training_sessions")
    .select("id, session_date, group_id, training_groups(name)")
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: false })
    .limit(200);
  if (fGroup !== "ALL") sessionQuery = sessionQuery.eq("group_id", fGroup);
  const { data: rangeSessions } = await sessionQuery;

  const sessionIds = (rangeSessions ?? []).map((s) => s.id);
  const { data: attRows } = sessionIds.length
    ? await supabase.from("attendance").select("status").in("session_id", sessionIds)
    : { data: [] as never[] };

  const counts = { present: 0, excused: 0, sick: 0, absent: 0 };
  for (const a of attRows ?? []) {
    if (a.status in counts) counts[a.status as keyof typeof counts]++;
  }
  const totalMarks = Object.values(counts).reduce((a, b) => a + b, 0);
  const rate = totalMarks > 0 ? Math.round((counts.present / totalMarks) * 100) : 0;

  const { data: recentSessions } = await supabase
    .from("training_sessions")
    .select("id, session_date, group_id, training_groups(name)")
    .order("session_date", { ascending: false })
    .limit(14);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Absensi</h1>
          <p className="page-subtitle">Catat kehadiran dan pantau tren per periode</p>
        </div>
      </header>

      {/* Ringkasan periode */}
      <section aria-label="Ringkasan kehadiran" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="stat-card"><p className="stat-label">Hadir</p><p className="stat-value text-brand-600">{counts.present}</p></div>
        <div className="stat-card"><p className="stat-label">Izin</p><p className="stat-value text-amber-500">{counts.excused}</p></div>
        <div className="stat-card"><p className="stat-label">Sakit</p><p className="stat-value text-sky-600">{counts.sick}</p></div>
        <div className="stat-card"><p className="stat-label">Tidak Hadir</p><p className="stat-value text-red-600">{counts.absent}</p></div>
        <div className="stat-card col-span-2 sm:col-span-1"><p className="stat-label">% Hadir</p><p className="stat-value">{rate}%</p></div>
      </section>

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <label className="label">Dari
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="label">Sampai
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <label className="label">Kelompok
          <select name="group" defaultValue={fGroup} className="input">
            <option value="ALL">Semua</option>
            {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">Terapkan</button>
          <Link href="/absensi" className="btn-secondary">Reset</Link>
        </div>
      </form>

      <div className="card">
        <h2 className="card-title mb-3 !text-base !normal-case !tracking-normal font-semibold text-navy-900">Kelompok Latihan</h2>
        {(groups ?? []).length === 0 ? (
          <div className="empty-state"><p className="empty-state-title">Belum ada kelompok aktif.</p></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(groups ?? []).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-800">{g.name}</p>
                  {g.location && <p className="text-sm text-slate-500">{g.location}</p>}
                </div>
                <Link href={`/absensi/${g.id}?date=${today}`} className="btn-primary shrink-0 text-sm">
                  Buka
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="card-title !text-base !normal-case !tracking-normal font-semibold text-navy-900">Sesi Terakhir</h2>
          <span className="badge-neutral badge">{totalMarks} catatan ({ATTENDANCE_LABELS.present.toLowerCase()} {rate}%)</span>
        </div>
        {(recentSessions ?? []).length === 0 ? (
          <div className="empty-state"><p className="empty-state-title">Belum ada sesi tercatat.</p></div>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(recentSessions ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="text-slate-700">
                  {(s.training_groups as { name?: string } | null)?.name ?? "—"}
                </span>
                <Link
                  href={`/absensi/${s.group_id}?date=${s.session_date}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {s.session_date}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Label status: {ATTENDANCE_LABELS.present}, {ATTENDANCE_LABELS.excused}, {ATTENDANCE_LABELS.sick}, {ATTENDANCE_LABELS.absent}.
        Rekap detail per atlet tersedia di halaman Laporan.
      </p>
    </div>
  );
}
