import { createClient } from "@/lib/supabase/server";
import StatCard from "@/components/StatCard";
import GrowthChart, { type GrowthPoint } from "@/components/GrowthChart";
import GroupDistribution from "@/components/GroupDistribution";
import Link from "next/link";
import { DAY_NAMES } from "@/types";
import { rupiah } from "@/lib/events";

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
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
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

/** Label Bahasa Indonesia untuk aksi audit yang dikenal; aksi lain ditampilkan apa adanya (tanpa mengarang). */
const ACTIVITY_LABELS: Record<string, string> = {
  CREATE_EVENT_REGISTRATION: "Pendaftaran event dibuat",
  create_event_registration: "Pendaftaran event dibuat",
  create_athlete: "Atlet baru ditambahkan",
  mark_left_club: "Atlet keluar dari klub",
  CREATE_ACCOUNT: "Akun dibuat",
  DELETE_ACCOUNT: "Akun dihapus",
  UPDATE_EVENT_RACE_RULE: "Aturan/harga nomor lomba diubah",
  DELETE_EVENT_RACE_RULE: "Nomor lomba dihapus",
  update_event_status: "Status event diubah",
  UPDATE_PAYMENT_SETTINGS: "Pengaturan pembayaran diubah",
  VERIFY_PAYMENT: "Pembayaran diverifikasi",
};

function greeting(h: number) {
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
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
    { data: allEvents },
    { data: eventPayments },
    { data: registrations },
    { data: auditLogs },
    { data: currentProfile },
    { data: perfRows },
  ] = await Promise.all([
    supabase.from("athletes").select("id, status, join_date, left_at, cakra"),
    supabase
      .from("training_sessions")
      .select("id, session_date, start_time, end_time, location, group_id, training_groups(name)")
      .eq("session_date", today),
    supabase.from("training_groups").select("id, name, is_active").eq("is_active", true),
    supabase.from("training_group_members").select("group_id, athlete_id").is("left_at", null),
    supabase.from("events").select("id, name, status, event_date, location, registration_deadline").order("event_date", { ascending: false }),
    supabase.from("event_payments").select("event_id, cakra, total_amount, amount_paid, payment_status"),
    supabase.from("event_registrations").select("id, event_id"),
    supabase.from("audit_logs").select("id, action, entity, created_at, profiles(full_name)").order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("role, full_name").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle(),
    supabase.from("athlete_performance_results").select("id, athlete_id, stroke, distance, time_cs, recorded_at, athletes(cakra)"),
  ]);

  const athletes = allAthletes ?? [];
  const payments = eventPayments ?? [];
  const regs = registrations ?? [];

  // ===== 8 KPI utama =====
  const totalAthletes = athletes.length;
  const activeAthletes = athletes.filter((a) => a.status === "ACTIVE").length;
  const openEventCount = (allEvents ?? []).filter((e) => e.status === "OPEN").length;
  const totalRegistrations = regs.length;
  const unpaidCount = payments.filter((p) => p.payment_status === "BELUM_BAYAR").length;
  const pendingCount = payments.filter((p) => p.payment_status === "MENUNGGU_VERIFIKASI").length;
  const transactionCount = payments.filter((p) => p.payment_status !== "CANCELLED").length;
  const totalRevenue = payments.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)).reduce((n, p) => n + Number(p.amount_paid || 0), 0);

  // ===== Financial overview =====
  const finBills = payments.filter((p) => p.payment_status !== "CANCELLED").reduce((n, p) => n + Number(p.total_amount || 0), 0);
  const finPaid = payments.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)).reduce((n, p) => n + Number(p.amount_paid || 0), 0);
  const finOutstanding = payments.filter((p) => ["BELUM_BAYAR"].includes(p.payment_status)).reduce((n, p) => n + Number(p.total_amount || 0), 0)
    + payments.filter((p) => p.payment_status === "DP").reduce((n, p) => n + Math.max(Number(p.total_amount || 0) - Number(p.amount_paid || 0), 0), 0);
  const statusCount = (s: string) => payments.filter((p) => p.payment_status === s).length;

  const finRows = [
    { label: "Total tagihan", value: finBills, tone: "bg-navy-500" },
    { label: "Sudah dibayar (terverifikasi)", value: finPaid, tone: "bg-brand-600" },
    { label: "Belum dibayar", value: finOutstanding, tone: "bg-red-400" },
  ];
  const finMax = Math.max(...finRows.map((r) => r.value), 1);

  // ===== Event overview =====
  const payByEvent = new Map<string, { regs: number; bills: number; paid: number; unpaid: number; pending: number }>();
  for (const r of regs) {
    const cur = payByEvent.get(r.event_id) ?? { regs: 0, bills: 0, paid: 0, unpaid: 0, pending: 0 };
    cur.regs += 1;
    payByEvent.set(r.event_id, cur);
  }
  for (const p of payments) {
    if (!p.event_id || p.payment_status === "CANCELLED") continue;
    const cur = payByEvent.get(p.event_id) ?? { regs: 0, bills: 0, paid: 0, unpaid: 0, pending: 0 };
    cur.bills += Number(p.total_amount || 0);
    if (["LUNAS", "DP"].includes(p.payment_status)) cur.paid += Number(p.amount_paid || 0);
    if (p.payment_status === "BELUM_BAYAR") cur.unpaid += 1;
    if (p.payment_status === "MENUNGGU_VERIFIKASI") cur.pending += 1;
    payByEvent.set(p.event_id, cur);
  }
  const eventRows = (allEvents ?? []).map((e) => ({ ...e, stat: payByEvent.get(e.id) ?? { regs: 0, bills: 0, paid: 0, unpaid: 0, pending: 0 } }));
  const openEvents = eventRows.filter((e) => e.status === "OPEN");
  const otherEvents = eventRows.filter((e) => e.status !== "OPEN");

  // ===== Kehadiran bulan ini (untuk Cakra overview) =====
  const { data: monthSessions } = await supabase
    .from("training_sessions")
    .select("id")
    .gte("session_date", monthStart);
  const monthSessionIds = (monthSessions ?? []).map((s) => s.id);
  const attByCakra = new Map<string, { present: number; total: number }>();
  if (monthSessionIds.length > 0) {
    const { data: att } = await supabase
      .from("attendance")
      .select("athlete_id, status")
      .in("session_id", monthSessionIds);
    const cakraOf = new Map(athletes.map((a) => [a.id, a.cakra || "Tanpa Cakra"]));
    for (const a of att ?? []) {
      const key = cakraOf.get(a.athlete_id) ?? "Tanpa Cakra";
      const cur = attByCakra.get(key) ?? { present: 0, total: 0 };
      cur.total += 1;
      if (a.status === "present") cur.present += 1;
      attByCakra.set(key, cur);
    }
  }

  // ===== Rekap per Cakra =====
  const cakraSummary = new Map<string, { athletes: number; active: number; registrations: number; bills: number; paid: number; remaining: number; attPresent: number; attTotal: number }>();
  for (const athlete of athletes) {
    const key = athlete.cakra || "Tidak tersedia";
    const current = cakraSummary.get(key) ?? { athletes: 0, active: 0, registrations: 0, bills: 0, paid: 0, remaining: 0, attPresent: 0, attTotal: 0 };
    current.athletes += 1;
    if (athlete.status === "ACTIVE") current.active += 1;
    cakraSummary.set(key, current);
  }
  for (const payment of payments) {
    if (payment.payment_status === "CANCELLED") continue;
    const key = payment.cakra || "Tidak tersedia";
    const current = cakraSummary.get(key) ?? { athletes: 0, active: 0, registrations: 0, bills: 0, paid: 0, remaining: 0, attPresent: 0, attTotal: 0 };
    current.registrations += 1;
    current.bills += Number(payment.total_amount || 0);
    current.paid += Number(payment.amount_paid || 0);
    current.remaining += Math.max(Number(payment.total_amount || 0) - Number(payment.amount_paid || 0), 0);
    cakraSummary.set(key, current);
  }
  for (const [key, att] of Array.from(attByCakra.entries())) {
    const current = cakraSummary.get(key) ?? { athletes: 0, active: 0, registrations: 0, bills: 0, paid: 0, remaining: 0, attPresent: 0, attTotal: 0 };
    current.attPresent += att.present;
    current.attTotal += att.total;
    cakraSummary.set(key, current);
  }
  const cakraRows = Array.from(cakraSummary.entries()).sort(([a], [b]) => a.localeCompare(b));

  // ===== Kehadiran hari ini =====
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

  // ===== Jadwal & distribusi (fitur existing dipertahankan) =====
  const { data: todaySchedules } = await supabase
    .from("training_schedules")
    .select("id, group_id, start_time, end_time, location, training_groups(name)")
    .eq("day_of_week", todayDow)
    .eq("is_active", true);

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

  const byRange: Record<string, GrowthPoint[]> = {
    "7d": buildGrowth(athletes, 1),
    "30d": buildGrowth(athletes, 1),
    "3m": buildGrowth(athletes, 3),
    "6m": buildGrowth(athletes, 6),
    "1y": buildGrowth(athletes, 12),
    all: buildGrowth(athletes, 12),
  };

  const scopedRole = currentProfile?.role as string | undefined;
  const isAdmin = scopedRole === "admin";
  const firstName = (currentProfile?.full_name || "").split(" ")[0] || "Admin";

  const quickActions = [
    ...(isAdmin ? [{ href: "/atlet", label: "Tambah Atlet" }, { href: "/event-settings", label: "Buat Event" }] : []),
    { href: "/events", label: "Tambah Pendaftaran" },
    ...(isAdmin ? [{ href: "/keuangan", label: "Verifikasi Pembayaran" }, { href: "/accounts", label: "Buat Akun" }, { href: "/import-export", label: "Export Data" }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pt-14 lg:pt-0">
      {/* Header */}
      <header className="page-header !mb-0">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {greeting(now.getHours())}, {firstName}
          </p>
          <h1 className="page-title flex items-center gap-2">
            TEAM CAKRA SWIMMING
            <span aria-hidden className="hidden sm:inline-block h-2 w-2 rounded-full bg-brand-500" />
          </h1>
          <p className="page-subtitle">
            {DAY_NAMES[todayDow]}, {now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            {scopedRole === "ketua_kelompok" && <> • <span className="font-medium text-brand-700">Ketua Kelompok</span></>}
          </p>
        </div>
        {isAdmin && (
          <Link href="/reports" className="btn-secondary text-sm">Laporan Center</Link>
        )}
      </header>

      {/* Quick actions */}
      <nav aria-label="Aksi cepat" className="flex flex-wrap gap-2">
        {quickActions.map((a) => (
          <Link key={a.href + a.label} href={a.href} className="btn-secondary text-xs sm:text-sm">
            <span aria-hidden className="text-brand-600 font-bold">+</span> {a.label}
          </Link>
        ))}
      </nav>

      {/* 8 KPI */}
      <section aria-label="Ringkasan klub" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Atlet" value={totalAthletes} />
        <StatCard label="Atlet Aktif" value={activeAthletes} accent="text-emerald-600" />
        <StatCard label="Event Aktif" value={openEventCount} accent="text-brand-700" />
        <StatCard label="Total Pendaftar" value={totalRegistrations} accent="text-navy-700" />
        <StatCard label="Menunggu Pembayaran" value={unpaidCount} accent="text-red-600" />
        <StatCard label="Menunggu Verifikasi" value={pendingCount} accent="text-amber-600" />
        <StatCard label="Total Pembayaran" value={`${transactionCount} transaksi`} accent="text-sky-600" />
        <StatCard label="Total Pendapatan" value={rupiah(totalRevenue)} accent="text-emerald-600" hint={`Tagihan ${rupiah(finBills)}`} />
      </section>

      {/* Financial + Activity */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="card-title">Financial Overview</h2>
          <div className="mt-4 space-y-4">
            {finRows.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="text-slate-600">{r.label}</span>
                  <span className="font-semibold text-navy-900">{rupiah(r.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="presentation">
                  <div className={`h-full rounded-full ${r.tone}`} style={{ width: `${Math.round((r.value / finMax) * 100)}%` }} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
              <div><p className="stat-label">Verifikasi</p><p className="text-lg font-bold text-amber-600">{statusCount("MENUNGGU_VERIFIKASI")}</p></div>
              <div><p className="stat-label">Lunas</p><p className="text-lg font-bold text-brand-600">{statusCount("LUNAS")}</p></div>
              <div><p className="stat-label">DP</p><p className="text-lg font-bold text-sky-600">{statusCount("DP")}</p></div>
              <div><p className="stat-label">Belum Bayar</p><p className="text-lg font-bold text-red-600">{statusCount("BELUM_BAYAR")}</p></div>
              <div><p className="stat-label">Ditolak</p><p className="text-lg font-bold text-slate-500">{statusCount("DITOLAK")}</p></div>
              <div><p className="stat-label">Batal</p><p className="text-lg font-bold text-slate-400">{statusCount("CANCELLED")}</p></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Recent Activity</h2>
            {isAdmin && <Link href="/audit" className="text-xs font-medium text-brand-700 hover:underline">Semua log</Link>}
          </div>
          {(auditLogs ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Belum ada aktivitas tercatat.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {(auditLogs ?? []).map((l) => {
                const actor = (l.profiles as { full_name?: string } | null)?.full_name ?? "System";
                return (
                  <li key={l.id} className="flex items-start gap-3 py-2.5">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-700">{ACTIVITY_LABELS[l.action] ?? l.action}</p>
                      <p className="text-xs text-slate-400">{actor} • {new Date(l.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Event overview */}
      <section aria-label="Overview event" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="card-title !text-base !normal-case !tracking-normal font-semibold text-navy-900">Event Overview</h2>
          {isAdmin && <Link href="/event-settings" className="text-xs font-medium text-brand-700 hover:underline">Kelola event</Link>}
        </div>
        {eventRows.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Belum ada event.</p>
            {isAdmin && <Link href="/event-settings" className="btn-primary mt-2 text-sm">Buat Event Pertama</Link>}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {openEvents.map((e) => (
                <article key={e.id} className="card-flat border-l-4 !border-l-brand-500">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {e.event_date}{e.location ? ` • ${e.location}` : ""}
                        {e.registration_deadline ? ` • tutup ${e.registration_deadline}` : ""}
                      </p>
                    </div>
                    <span className="badge-success badge shrink-0">OPEN</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div><dt className="stat-label">Pendaftar</dt><dd className="text-sm font-bold">{e.stat.regs}</dd></div>
                    <div><dt className="stat-label">Masuk</dt><dd className="text-sm font-bold text-brand-600">{rupiah(e.stat.paid)}</dd></div>
                    <div><dt className="stat-label">Belum</dt><dd className="text-sm font-bold text-red-600">{e.stat.unpaid}</dd></div>
                    <div><dt className="stat-label">Verif.</dt><dd className="text-sm font-bold text-amber-600">{e.stat.pending}</dd></div>
                  </dl>
                  <div className="mt-3"><Link href={`/events/${e.id}`} className="btn-secondary px-3 py-1.5 text-xs">View Event</Link></div>
                </article>
              ))}
              {openEvents.length === 0 && <p className="text-sm text-slate-500">Tidak ada event berstatus OPEN saat ini.</p>}
            </div>
            {otherEvents.length > 0 && (
              <div className="table-wrap">
                <table className="table !min-w-[560px]">
                  <thead><tr><th>Event</th><th>Status</th><th>Tanggal</th><th>Pendaftar</th><th>Terbayar</th></tr></thead>
                  <tbody>
                    {otherEvents.slice(0, 6).map((e) => (
                      <tr key={e.id}>
                        <td className="max-w-[220px] truncate font-medium">{e.name}</td>
                        <td><span className={`badge ${e.status === "DRAFT" ? "badge-neutral" : e.status === "CLOSED" ? "badge-warning" : "badge-info"}`}>{e.status}</span></td>
                        <td className="whitespace-nowrap text-slate-500">{e.event_date}</td>
                        <td>{e.stat.regs}</td>
                        <td className="whitespace-nowrap">{rupiah(e.stat.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Cakra overview */}
      <section className="card overflow-x-auto">
        <h2 className="card-title mb-3 !text-base !normal-case !tracking-normal font-semibold text-navy-900">Cakra Overview</h2>
        {cakraRows.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada data Cakra.</p>
        ) : (
          <table className="table !min-w-[760px]">
            <thead><tr><th>Cakra</th><th>Atlet</th><th>Aktif</th><th>Pendaftaran</th><th>Tagihan</th><th>Masuk</th><th>Kehadiran*</th></tr></thead>
            <tbody>
              {cakraRows.map(([name, row]) => (
                <tr key={name}>
                  <td className="font-medium">{name}</td>
                  <td>{row.athletes}</td>
                  <td>{row.active}</td>
                  <td>{row.registrations}</td>
                  <td className="whitespace-nowrap">{rupiah(row.bills)}</td>
                  <td className="whitespace-nowrap text-brand-700">{rupiah(row.paid)}</td>
                  <td>{row.attTotal > 0 ? `${Math.round((row.attPresent / row.attTotal) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-400">*Persentase hadir dari sesi latihan bulan ini.</p>
      </section>

      {/* Performance overview */}
      <section aria-label="Performance overview" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title !text-base !normal-case !tracking-normal font-semibold text-navy-900">Performance Overview</h2>
          <Link href="/performance" className="btn-secondary px-3 py-1.5 text-xs">Kelola Performance</Link>
        </div>
        {(() => {
          const perf = (perfRows ?? []) as { id: string; athlete_id: string; stroke: string; distance: number; time_cs: number | null; recorded_at: string; athletes: { cakra?: string | null } | { cakra?: string | null }[] | null }[];
          const pbKeys = new Set<string>();
          const bestBy = new Map<string, number>();
          for (const r of perf) {
            if (r.time_cs == null) continue;
            const k = `${r.athlete_id}|${r.stroke}|${r.distance}`;
            const cur = bestBy.get(k);
            if (cur == null || r.time_cs < cur) {
              if (cur != null) pbKeys.add(r.athlete_id);
              bestBy.set(k, r.time_cs);
            }
          }
          const thisMonth = perf.filter((r) => r.recorded_at >= monthStart).length;
          const byCakraPerf = new Map<string, { athletes: Set<string>; results: number; improved: number }>();
          for (const r of perf) {
            const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
            const ck = a?.cakra || "Tanpa Cakra";
            const cur = byCakraPerf.get(ck) ?? { athletes: new Set<string>(), results: 0, improved: 0 };
            cur.results += 1;
            cur.athletes.add(r.athlete_id);
            byCakraPerf.set(ck, cur);
          }
          return (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="stat-card"><p className="stat-label">Total Hasil Tercatat</p><p className="stat-value">{perf.length}</p></div>
                <div className="stat-card"><p className="stat-label">Atlet dengan PB Baru</p><p className="stat-value text-brand-600">{pbKeys.size}</p></div>
                <div className="stat-card"><p className="stat-label">Atlet Berprestasi Aktif</p><p className="stat-value">{byCakraPerf.size > 0 ? Array.from(byCakraPerf.values()).reduce((n, v) => n + v.athletes.size, 0) : 0}</p></div>
                <div className="stat-card"><p className="stat-label">Hasil Bulan Ini</p><p className="stat-value">{thisMonth}</p></div>
              </div>
              {perf.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-title">Belum ada hasil performance tercatat.</p>
                  <p className="empty-state-desc">Coach/admin dapat mulai mencatat lewat halaman Performance atau profil atlet.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table !min-w-[560px]">
                    <thead><tr><th>Cakra</th><th>Atlet dengan Hasil</th><th>Total Hasil</th><th>PB Improvements</th></tr></thead>
                    <tbody>
                      {Array.from(byCakraPerf.entries()).map(([name, v]) => {
                        const perAthleteBest = new Map<string, number>();
                        let improvements = 0;
                        const chrono = perf.filter((r) => (Array.isArray(r.athletes) ? r.athletes[0] : r.athletes)?.cakra === name.replace(/^Tanpa Cakra$/, "Tanpa Cakra")).sort((x, y) => x.recorded_at.localeCompare(y.recorded_at));
                        void chrono;
                        for (const r of perf) {
                          const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
                          if ((a?.cakra || "Tanpa Cakra") !== name) continue;
                          if (r.time_cs == null) continue;
                          const k = `${r.athlete_id}|${r.stroke}|${r.distance}`;
                          const prev = perAthleteBest.get(k);
                          if (prev != null && r.time_cs < prev) improvements += 1;
                          if (prev == null || r.time_cs < prev) perAthleteBest.set(k, r.time_cs);
                        }
                        return (
                          <tr key={name}>
                            <td className="font-medium">{name}</td>
                            <td>{v.athletes.size}</td>
                            <td>{v.results}</td>
                            <td className="text-brand-700">{improvements}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* Grafik existing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthChart data={byRange["6m"]} byRange={byRange} />
        <GroupDistribution items={distribution} />
      </div>

      {/* Sesi hari ini + kehadiran */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="card-title !text-base !normal-case !tracking-normal font-semibold text-navy-900">Sesi Latihan Hari Ini</h2>
          <div className="flex gap-2 text-xs">
            <span className="badge-success badge">Hadir {present}</span>
            <span className="badge-warning badge">Izin {excused} / Sakit {sick}</span>
            <span className="badge-danger badge">Alpa {absent}</span>
            <span className="badge-info badge">{rate}%</span>
          </div>
        </div>
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
      </div>
    </div>
  );
}
