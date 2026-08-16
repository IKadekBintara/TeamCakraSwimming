import { createClient } from "@/lib/supabase/server";
import StatCard from "@/components/StatCard";
import GrowthChart, { type GrowthPoint } from "@/components/GrowthChart";
import GroupDistribution from "@/components/GroupDistribution";
import Link from "next/link";
import { DAY_NAMES } from "@/types";

export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function buildGrowth(
  athletes: { join_date: string | null; left_at: string | null; status: string }[],
  months: number
): GrowthPoint[] {
  const now = new Date();
  const points: GrowthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); // awal bulan berikutnya
    let active = 0, joined = 0, left = 0;
    for (const a of athletes) {
      const j = a.join_date ? new Date(a.join_date + "T00:00:00") : null;
      const l = a.left_at ? new Date(a.left_at + "T00:00:00") : null;
      if (j && j < end && (!l || l >= end)) active++;
      if (j && monthKey(j) === monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))) joined++;
      if (l && monthKey(l) === monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))) left++;
    }
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({ label: `${MONTH_ID[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, active, joined, left });
  }
  return points;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const todayDow = new Date().getDay();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const [
    { data: allAthletes },
    { data: todaySessions },
    { data: groups },
    { data: members },
  ] = await Promise.all([
    supabase.from("athletes").select("id, status, join_date, left_at"),
    supabase
      .from("training_sessions")
      .select("id, session_date, start_time, end_time, location, group_id, training_groups(name)")
      .eq("session_date", today),
    supabase.from("training_groups").select("id, name, is_active").eq("is_active", true),
    supabase.from("training_group_members").select("group_id, athlete_id").is("left_at", null),
  ]);

  const athletes = allAthletes ?? [];
  const totalAthletes = athletes.length;
  const activeAthletes = athletes.filter((a) => a.status === "ACTIVE").length;
  const newThisMonth = athletes.filter((a) => a.join_date && a.join_date >= monthStart).length;
  const newThisYear = athletes.filter((a) => a.join_date && a.join_date >= yearStart).length;
  const leftThisMonth = athletes.filter((a) => a.left_at && a.left_at >= monthStart).length;
  const totalLeft = athletes.filter((a) => a.status === "LEFT_CLUB").length;
  const netGrowth = newThisMonth - leftThisMonth;

  // Kehadiran hari ini
  const sessionIds = (todaySessions ?? []).map((s) => s.id);
  let present = 0, excused = 0, sick = 0, absent = 0;
  if (sessionIds.length > 0) {
    const { data: att } = await supabase
      .from("attendance")
      .select("status")
      .in("session_id", sessionIds);
    for (const a of att ?? []) {
      if (a.status === "present") present++;
      else if (a.status === "excused") excused++;
      else if (a.status === "sick") sick++;
      else if (a.status === "absent") absent++;
    }
  }
  const totalMarked = present + excused + sick + absent;
  const rate = totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0;

  // Sesi hari ini dari jadwal
  const { data: todaySchedules } = await supabase
    .from("training_schedules")
    .select("id, group_id, start_time, end_time, location, training_groups(name)")
    .eq("day_of_week", todayDow)
    .eq("is_active", true);

  // Distribusi atlet per grup
  const activeIds = new Set(athletes.filter((a) => a.status === "ACTIVE").map((a) => a.id));
  const groupCounts: Record<string, number> = {};
  for (const m of members ?? []) {
    if (activeIds.has(m.athlete_id)) {
      groupCounts[m.group_id] = (groupCounts[m.group_id] ?? 0) + 1;
    }
  }
  const distribution = (groups ?? [])
    .map((g) => ({ name: g.name, count: groupCounts[g.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  // Grafik pertumbuhan per rentang
  const byRange: Record<string, GrowthPoint[]> = {
    "7d": buildGrowth(athletes, 1),
    "30d": buildGrowth(athletes, 1),
    "3m": buildGrowth(athletes, 3),
    "6m": buildGrowth(athletes, 6),
    "1y": buildGrowth(athletes, 12),
    all: buildGrowth(athletes, 12),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {DAY_NAMES[todayDow]},{" "}
          {now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Atlet" value={totalAthletes} />
        <StatCard label="Atlet Aktif" value={activeAthletes} accent="text-emerald-600" />
        <StatCard label="Baru Bulan Ini" value={`+${newThisMonth}`} accent="text-sky-600" hint={`${newThisYear} tahun ini`} />
        <StatCard label="Keluar Bulan Ini" value={`−${leftThisMonth}`} accent="text-red-600" hint={`Net ${netGrowth >= 0 ? "+" : ""}${netGrowth}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sesi Hari Ini" value={todaySessions?.length ?? 0} accent="text-brand-700" />
        <StatCard label="Hadir" value={present} accent="text-emerald-600" />
        <StatCard label="Izin / Sakit" value={`${excused} / ${sick}`} accent="text-amber-600" />
        <StatCard label="Tingkat Kehadiran" value={`${rate}%`} accent="text-brand-700" hint={`${absent} alpa`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthChart data={byRange["6m"]} byRange={byRange} />
        <GroupDistribution items={distribution} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Sesi Latihan Hari Ini</h2>
        {(todaySchedules ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada jadwal latihan hari ini.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(todaySchedules ?? []).map((s) => {
              const g = s.training_groups as { name?: string } | null;
              const sessionExists = (todaySessions ?? []).some((ts) => ts.group_id === s.group_id);
              return (
                <li key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-slate-800">{g?.name ?? "—"}</p>
                    <p className="text-sm text-slate-500">
                      {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                      {s.location ? ` • ${s.location}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/absensi/${s.group_id}?date=${today}`}
                    className={sessionExists ? "btn-secondary text-sm" : "btn-primary text-sm"}
                  >
                    {sessionExists ? "Buka Absensi" : "Mulai Sesi"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
          Total atlet keluar (historis): {totalLeft}
        </p>
      </div>
    </div>
  );
}
