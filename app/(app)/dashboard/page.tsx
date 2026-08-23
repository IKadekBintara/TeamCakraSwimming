import { createClient } from "@/lib/supabase/server";
import StatCard from "@/components/StatCard";
import GrowthChart, { type GrowthPoint } from "@/components/GrowthChart";
import GroupDistribution from "@/components/GroupDistribution";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DAY_NAMES } from "@/types";
import { rupiah, CAKRA_GROUPS } from "@/lib/events";
import { normalizeCakra } from "@/lib/cakra";

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

/** Kartu antrean memerah saat ada verifikasi tertunda — sinyal visual prioritas. */
function queueTone(failed: number, pending: number) {
  if (failed > 0) return "border-red-300 bg-red-50/60";
  if (pending > 0) return "border-amber-300 bg-amber-50/40";
  return "";
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

  // Communication overview (staff only) — dihitung terpisah agar non-staff tak membebani
  const isStaff = ["admin", "operator"].includes((currentProfile?.role as string) ?? "");
  let commStats: { unread: number; reminders: number; pendingPay: number; deadlines: number; failed: number } | null = null;
  if (isStaff) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [unreadC, remC, failC] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
      supabase.from("notification_deliveries").select("id", { count: "exact", head: true }).gte("last_attempt_at", weekAgo).eq("status", "SENT"),
      supabase.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
    ]);
    const pendingPayNow = (eventPayments ?? []).filter((p) => p.payment_status === "BELUM_BAYAR").length;
    const dl7 = (allEvents ?? []).filter((e) => {
      if (e.status !== "OPEN" || !e.registration_deadline) return false;
      const [y, m, d] = String(e.registration_deadline).split("-").map(Number);
      const endMs = Date.UTC(y, m - 1, d, 16, 59, 59); // 23:59:59 WIB
      const days = (endMs - Date.now()) / 86400000;
      return days > 0 && days <= 7;
    }).length;
    commStats = {
      unread: unreadC.count ?? 0,
      reminders: remC.count ?? 0,
      pendingPay: pendingPayNow,
      deadlines: dl7,
      failed: failC.count ?? 0,
    };
  }

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
    const cakraOf = new Map(athletes.map((a) => [a.id, normalizeCakra(a.cakra)]));
    for (const a of att ?? []) {
      const key = cakraOf.get(a.athlete_id) ?? "Tidak tersedia";
      const cur = attByCakra.get(key) ?? { present: 0, total: 0 };
      cur.total += 1;
      if (a.status === "present") cur.present += 1;
      attByCakra.set(key, cur);
    }
  }

  // ===== Rekap per Cakra =====
  const cakraSummary = new Map<string, { athletes: number; active: number; registrations: number; bills: number; paid: number; remaining: number; attPresent: number; attTotal: number }>();
  for (const athlete of athletes) {
    const key = normalizeCakra(athlete.cakra);
    const current = cakraSummary.get(key) ?? { athletes: 0, active: 0, registrations: 0, bills: 0, paid: 0, remaining: 0, attPresent: 0, attTotal: 0 };
    current.athletes += 1;
    if (athlete.status === "ACTIVE") current.active += 1;
    cakraSummary.set(key, current);
  }
  for (const payment of payments) {
    if (payment.payment_status === "CANCELLED") continue;
    const key = normalizeCakra(payment.cakra);
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
  // Baris akhir: seluruh Cakra kanonik tampil (termasuk yang datanya 0), lalu
  // nilai non-kanonik apa pun di belakangnya — tanpa mengarang grup baru.
  const canonicalOrder = [...CAKRA_GROUPS].sort((a, b) => a.localeCompare(b));
  type CakraRow = { athletes: number; active: number; registrations: number; bills: number; paid: number; remaining: number; attPresent: number; attTotal: number };
  const emptyCakraRow: CakraRow = { athletes: 0, active: 0, registrations: 0, bills: 0, paid: 0, remaining: 0, attPresent: 0, attTotal: 0 };
  const cakraRows: [string, CakraRow][] = [
    ...canonicalOrder.map((c) => [c, cakraSummary.get(c) ?? emptyCakraRow] as [string, CakraRow]),
    ...Array.from(cakraSummary.entries())
      .filter(([k]) => !(canonicalOrder as readonly string[]).includes(k))
      .map(([k, v]) => [k, v] as [string, CakraRow]),
  ];

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

  const primaryAction = isAdmin ? { href: "/atlet", label: "Tambah Atlet" } : null;
  const secondaryActions = [
    ...(isAdmin ? [{ href: "/event-settings", label: "Buat Event" }, { href: "/keuangan?status=MENUNGGU_VERIFIKASI", label: "Verifikasi Pembayaran" }, { href: "/import-export", label: "Export Data" }] : []),
    ...(isAdmin ? [] : [{ href: "/events", label: "Tambah Pendaftaran" }]),
  ];
  const moreActions = [
    ...(isAdmin ? [{ href: "/events", label: "Tambah Pendaftaran" }, { href: "/accounts", label: "Buat Akun" }] : []),
  ];

  return (
    <div className="section-gap mx-auto max-w-6xl space-y-8 pt-14 lg:pt-0">
      {/* Header */}
      <header className="page-header !mb-0">
        <div>
          <p className="page-title">{greeting(now.getHours())}, {firstName}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">TEAM CAKRA SWIMMING</p>
          <p className="page-subtitle">
            {DAY_NAMES[todayDow]}, {now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            {scopedRole === "ketua_kelompok" && <> • <span className="font-medium text-brand-700">Ketua Kelompok</span></>}
          </p>
        </div>
        {isAdmin && (
          <Link href="/reports" className="btn-secondary text-sm">Laporan Center</Link>
        )}
      </header>

      {/* Action area — satu aksi utama, beberapa sekunder, sisanya terlipat */}
      {(primaryAction || secondaryActions.length > 0) && (
        <nav aria-label="Aksi cepat" className="flex flex-wrap items-center gap-2">
          {primaryAction && (
            <Link href={primaryAction.href} className="btn-primary text-sm">
              <span aria-hidden className="font-bold">+</span> {primaryAction.label}
            </Link>
          )}
          {secondaryActions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className="btn-secondary text-sm">
              {a.label}
            </Link>
          ))}
          {moreActions.length > 0 && (
            <details className="relative">
              <summary className="btn-ghost cursor-pointer select-none text-sm [&::-webkit-details-marker]:hidden">
                Lainnya <span aria-hidden className="text-xs">▾</span>
              </summary>
              <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {moreActions.map((a) => (
                  <Link key={a.href + a.label} href={a.href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800 dark:text-slate-200 dark:hover:bg-slate-700">
                    {a.label}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
      )}

      {/* Work queue — tugas yang menunggu aksi, prioritas di atas metrik */}
      {isStaff && (
        <section aria-label="Perlu tindakan" className="space-y-2">
          <h2 className="card-title">Perlu Tindakan</h2>
          {(pendingCount + unpaidCount + commStats?.failed! ) > 0 ? (
            <ul className="grid gap-2 md:grid-cols-3">
              <li>
                <Link href="/keuangan?status=MENUNGGU_VERIFIKASI" className={`card-flat flex items-center justify-between gap-2 transition-colors hover:border-brand-400 ${queueTone(commStats?.failed ?? 0, pendingCount)}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-900">{pendingCount} pembayaran menunggu verifikasi</span>
                    <span className="text-xs text-slate-500">Cek bukti transfer lalu setujui/tolak</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
              <li>
                <Link href="/registrations?pay=BELUM_BAYAR" className="card-flat flex items-center justify-between gap-2 transition-colors hover:border-brand-400">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-900">{unpaidCount} pendaftaran belum bayar</span>
                    <span className="text-xs text-slate-500">Ingatkan atlet/orang tua lewat Komunikasi</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
              <li>
                <Link href="/communication" className={`card-flat flex items-center justify-between gap-2 ${commStats && commStats.failed > 0 ? "border-red-300 bg-red-50/60" : ""}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-900">{commStats?.failed ?? 0} pengiriman notifikasi gagal</span>
                    <span className="text-xs text-slate-500">Retry manual dari halaman Komunikasi</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="sr-only">Jika ada kegagalan, kartu merah = prioritas tinggi</span>
                </Link>
              </li>
            </ul>
          ) : (
            <p className="card-flat text-sm text-slate-500">Semua tugas beres — tidak ada antrean. 🎉</p>
          )}
        </section>
      )}

      {/* 8 KPI */}
      <section aria-label="Ringkasan klub" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Atlet" value={totalAthletes} hint={`${activeAthletes} aktif`} />
        <StatCard label="Atlet Aktif" value={activeAthletes} />
        <StatCard label="Event Aktif" value={openEventCount} />
        <StatCard label="Total Pendaftar" value={totalRegistrations} />
        <StatCard label="Menunggu Pembayaran" value={unpaidCount} tone="text-red-600 dark:text-red-400" />
        <StatCard label="Menunggu Verifikasi" value={pendingCount} tone="text-amber-600 dark:text-amber-400" />
        <StatCard label="Total Pembayaran" value={`${transactionCount}`} hint="transaksi tercatat" />
        <StatCard label="Total Pendapatan" value={rupiah(totalRevenue)} tone="text-emerald-700 dark:text-emerald-400" hint={`Tagihan ${rupiah(finBills)}`} />
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
            <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 border-t border-slate-100 pt-3 sm:grid-cols-6">
              <div><p className="text-xs text-slate-500">Verifikasi</p><p className="text-sm font-semibold text-navy-900">{statusCount("MENUNGGU_VERIFIKASI")}</p></div>
              <div><p className="text-xs text-slate-500">Lunas</p><p className="text-sm font-semibold text-navy-900">{statusCount("LUNAS")}</p></div>
              <div><p className="text-xs text-slate-500">DP</p><p className="text-sm font-semibold text-navy-900">{statusCount("DP")}</p></div>
              <div><p className="text-xs text-red-600 dark:text-red-400">Belum Bayar</p><p className="text-sm font-semibold text-navy-900">{statusCount("BELUM_BAYAR")}</p></div>
              <div><p className="text-xs text-slate-500">Ditolak</p><p className="text-sm font-semibold text-slate-400">{statusCount("DITOLAK")}</p></div>
              <div><p className="text-xs text-slate-500">Batal</p><p className="text-sm font-semibold text-slate-400">{statusCount("CANCELLED")}</p></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Recent Activity</h2>
            {isAdmin && <Link href="/audit" className="text-xs font-medium text-brand-700 hover:underline">Semua log</Link>}
          </div>
          {(auditLogs ?? []).length === 0 ? (
            <p className="py-2 text-sm text-slate-500">Belum ada aktivitas terbaru.</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100">
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
          <h2 className="text-base font-semibold text-navy-900">Event Overview</h2>
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
                  <div className="mt-3"><Link href={`/events/${e.id}`} className="btn-secondary px-3 py-1.5 text-xs">Lihat Event</Link></div>
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
        <h2 className="mb-3 text-base font-semibold text-navy-900">Cakra Overview</h2>
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
          <h2 className="text-base font-semibold text-navy-900">Performance Overview</h2>
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
            const ck = normalizeCakra(a?.cakra);
            const cur = byCakraPerf.get(ck) ?? { athletes: new Set<string>(), results: 0, improved: 0 };
            cur.results += 1;
            cur.athletes.add(r.athlete_id);
            byCakraPerf.set(ck, cur);
          }
          return (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Hasil tercatat</dt><dd className="text-lg font-bold text-navy-900">{perf.length}</dd></div>
                <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Atlet dengan PB baru</dt><dd className="text-lg font-bold text-navy-900">{pbKeys.size}</dd></div>
                <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Atlet berprestasi</dt><dd className="text-lg font-bold text-navy-900">{byCakraPerf.size > 0 ? Array.from(byCakraPerf.values()).reduce((n, v) => n + v.athletes.size, 0) : 0}</dd></div>
                <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Hasil bulan ini</dt><dd className="text-lg font-bold text-navy-900">{thisMonth}</dd></div>
              </dl>
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
                        for (const r of perf) {
                          const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
                          if (normalizeCakra(a?.cakra) !== name) continue;
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

      {/* Communication overview (staff only) */}
      {isStaff && (
        <section aria-label="Communication overview" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy-900">Communication Overview</h2>
            <a href="/communication" className="text-sm text-brand-700 hover:underline dark:text-brand-300">Kelola →</a>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Belum dibaca</dt><dd className="text-lg font-bold text-navy-900">{commStats?.unread ?? 0}</dd></div>
            <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Reminder terkirim (7h)</dt><dd className="text-lg font-bold text-navy-900">{commStats?.reminders ?? 0}</dd></div>
            <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Pengingat bayar pending</dt><dd className={`text-lg font-bold ${(commStats?.pendingPay ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-navy-900"}`}>{commStats?.pendingPay ?? 0}</dd></div>
            <div className="flex items-baseline justify-between gap-2"><dt className="text-sm text-slate-500">Deadline ≤7 hari</dt><dd className={`text-lg font-bold ${(commStats?.deadlines ?? 0) > 0 ? "text-brand-700 dark:text-brand-300" : "text-navy-900"}`}>{commStats?.deadlines ?? 0}</dd></div>
          </dl>
        </section>
      )}

      {/* Grafik existing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthChart data={byRange["6m"]} byRange={byRange} />
        <GroupDistribution items={distribution} />
      </div>

      {/* Sesi hari ini + kehadiran */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-900">Sesi Latihan Hari Ini</h2>
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
