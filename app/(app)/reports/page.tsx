import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { rupiah } from "@/lib/events";
import { getCakraGroups } from "@/lib/groups";

export const dynamic = "force-dynamic";

const EXPORT_BASE = "/api/export";

type ReportKey = "athlete" | "attendance" | "registration" | "payment" | "financial" | "cakra";

const REPORTS: { key: ReportKey; title: string; desc: string; href: string }[] = [
  { key: "athlete", title: "Athlete Report", desc: "Data atlet: Kelompok, KU, status, program.", href: "/atlet" },
  { key: "attendance", title: "Attendance Report", desc: "Rekap kehadiran per periode + export Excel existing.", href: "/laporan" },
  { key: "registration", title: "Event Registration Report", desc: "Semua pendaftaran event + status pembayaran.", href: "/registrations" },
  { key: "payment", title: "Payment Report", desc: "Transaksi pembayaran event per periode.", href: "#payment" },
  { key: "financial", title: "Financial Report", desc: "Pendapatan, outstanding, DP per event & per kelompok.", href: "#financial" },
  { key: "cakra", title: "Cakra Report", desc: "Ringkasan atlet & keuangan per kelompok/Cakra.", href: "#cakra" },
];

function qs(base: string, params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  return `${base}?${sp.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; event?: string; group?: string; ku?: string; pay?: string };
}) {
  const supabase = createClient();
  const now = new Date();
  const from = searchParams.from ?? `${now.getFullYear()}-01-01`;
  const to = searchParams.to ?? now.toISOString().slice(0, 10);
  const fEvent = searchParams.event ?? "ALL";
  const fGroup = searchParams.group ?? "ALL";
  const fPay = searchParams.pay ?? "ALL";

  const [{ data: events }, { data: athletes }, { data: memberships }, groupsR] = await Promise.all([
    supabase.from("events").select("id, name").order("event_date", { ascending: false }),
    supabase.from("athletes").select("id, status"),
    supabase.from("training_group_members").select("athlete_id, group_id").is("left_at", null),
    getCakraGroups(),
  ]);
  const groups = groupsR ?? [];

  // Peta kelompok: athlete_id → {id, nama}. Satu sumber kebenaran: training_group_members.
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const groupGidOf = new Map<string, string>();
  const groupOf = new Map<string, string>();
  for (const m of memberships ?? []) {
    groupGidOf.set(m.athlete_id, m.group_id);
    groupOf.set(m.athlete_id, groupNameById.get(m.group_id) ?? "Tidak tersedia");
  }

  // ===== Payment report rows (dengan filter) =====
  // KU hidup di event_registrations — diambil via relasi (kolom ku TIDAK ada di event_payments).
  let payQuery = supabase
    .from("event_payments")
    .select("transaction_id, athlete_id, athlete_name, registration_fee, admin_fee, total_amount, amount_paid, remaining_amount, payment_status, created_at, event:events(name), registration:event_registrations(ku)")
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .order("created_at", { ascending: false });
  if (fEvent !== "ALL") payQuery = payQuery.eq("event_id", fEvent);
  if (fPay !== "ALL") payQuery = payQuery.eq("payment_status", fPay);
  let payments = (await payQuery).data ?? [];

  // Filter kelompok via relasi membership (bukan kolom cakra legacy).
  if (fGroup !== "ALL") payments = payments.filter((p) => groupGidOf.get(p.athlete_id as string) === fGroup);

  // ===== Financial aggregation =====
  const sum = (arr: typeof payments, fn: (p: (typeof payments)[number]) => number) => arr.reduce((n, p) => n + fn(p), 0);
  const valid = payments.filter((p) => p.payment_status !== "CANCELLED");
  const totalRevenue = sum(payments.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)), (p) => Number(p.amount_paid || 0));
  const totalBilled = sum(valid, (p) => Number(p.total_amount || 0));
  // Pemisahan komponen: UANG EVENT (pendapatan event) ≠ UANG ADMIN.
  const totalBilledEvent = sum(valid, (p) => Number(p.registration_fee || 0));
  const totalRevenueEvent = sum(payments.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)), (p) => Number(p.registration_fee || 0));
  const totalAdminRevenue = sum(payments.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)), (p) => Number(p.admin_fee || 0));
  const totalOutstanding =
    sum(valid.filter((p) => p.payment_status === "BELUM_BAYAR"), (p) => Number(p.total_amount || 0)) +
    sum(valid.filter((p) => p.payment_status === "DP"), (p) => Math.max(Number(p.total_amount || 0) - Number(p.amount_paid || 0), 0));
  const dpCount = payments.filter((p) => p.payment_status === "DP").length;

  // Per event / per kelompok / per tanggal
  const byEvent = new Map<string, { billed: number; paid: number }>();
  const byGroup = new Map<string, { billed: number; paid: number }>();
  const byDate = new Map<string, number>();
  for (const p of valid) {
    const evName = (p.event as { name?: string } | null)?.name ?? "Tanpa Event";
    const ev = byEvent.get(evName) ?? { billed: 0, paid: 0 };
    ev.billed += Number(p.total_amount || 0);
    if (["LUNAS", "DP"].includes(p.payment_status)) ev.paid += Number(p.amount_paid || 0);
    byEvent.set(evName, ev);

    const ck = groupOf.get(p.athlete_id as string) ?? "BELUM DIATUR";
    const cv = byGroup.get(ck) ?? { billed: 0, paid: 0 };
    cv.billed += Number(p.total_amount || 0);
    if (["LUNAS", "DP"].includes(p.payment_status)) cv.paid += Number(p.amount_paid || 0);
    byGroup.set(ck, cv);

    const d = String(p.created_at).slice(0, 10);
    if (["LUNAS", "DP"].includes(p.payment_status)) byDate.set(d, (byDate.get(d) ?? 0) + Number(p.amount_paid || 0));
  }

  // ===== Cakra report (atlet ringkas) =====
  const groupStats = new Map<string, { total: number; active: number }>();
  for (const a of athletes ?? []) {
    const key = groupOf.get(a.id) ?? "BELUM DIATUR";
    const cur = groupStats.get(key) ?? { total: 0, active: 0 };
    cur.total += 1;
    if (a.status === "ACTIVE") cur.active += 1;
    groupStats.set(key, cur);
  }

  const filterForm = (
    <form method="get" className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <label className="label">Dari
        <input className="input" type="date" name="from" defaultValue={from} />
      </label>
      <label className="label">Sampai
        <input className="input" type="date" name="to" defaultValue={to} />
      </label>
      <label className="label">Event
        <select className="input" name="event" defaultValue={fEvent}>
          <option value="ALL">Semua</option>
          {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <label className="label">Kelompok
        <select className="input" name="group" defaultValue={fGroup}>
          <option value="ALL">Semua</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label className="label">Status Bayar
        <select className="input" name="pay" defaultValue={fPay}>
          <option value="ALL">Semua</option>
          <option value="BELUM_BAYAR">Belum Bayar</option>
          <option value="MENUNGGU_VERIFIKASI">Menunggu Verifikasi</option>
          <option value="DP">DP</option>
          <option value="LUNAS">Lunas</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
      </label>
      <div className="flex items-end gap-2 lg:col-span-6">
        <button type="submit" className="btn-primary">Terapkan Filter</button>
        <Link href="/reports" className="btn-secondary">Reset</Link>
      </div>
    </form>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Report Center</h1>
          <p className="page-subtitle">Enam laporan klub dari data transaksi nyata. Export memakai endpoint resmi.</p>
        </div>
      </header>

      {/* Pilihan laporan */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <article key={r.key} className="card-flat flex flex-col justify-between gap-3">
            <div>
              <p className="font-semibold text-navy-900">{r.title}</p>
              <p className="mt-1 text-xs text-slate-500">{r.desc}</p>
            </div>
            <div className="flex gap-2">
              {r.href.startsWith("#") ? (
                <Link href={`#${r.href.slice(1)}`} className="btn-secondary px-3 py-1.5 text-xs">Lihat di bawah</Link>
              ) : (
                <Link href={r.href} className="btn-secondary px-3 py-1.5 text-xs">View</Link>
              )}
            </div>
          </article>
        ))}
      </section>

      {filterForm}

      {/* Payment report */}
      <section id="payment" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="card-title !text-base !normal-case !tracking-normal font-semibold text-navy-900">Payment Report ({payments.length})</h2>
          <a className="btn-secondary px-3 py-1.5 text-xs"
            href={qs(EXPORT_BASE, { kind: "event_registrations", from, to })}>
            Export Excel
          </a>
        </div>
        {payments.length === 0 ? (
          <div className="empty-state"><p className="empty-state-title">Tidak ada transaksi pada filter ini.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table !min-w-[820px]">
              <thead><tr><th>Tanggal</th><th>Atlet</th><th>Event</th><th>Kelompok</th><th>KU</th><th>Total</th><th>Dibayar</th><th>Status</th></tr></thead>
              <tbody>
                {payments.slice(0, 50).map((p) => (
                  <tr key={p.transaction_id}>
                    <td className="whitespace-nowrap text-slate-500">{String(p.created_at).slice(0, 10)}</td>
                    <td className="font-medium">{p.athlete_name}</td>
                    <td className="max-w-[160px] truncate">{(p.event as { name?: string } | null)?.name ?? "—"}</td>
                    <td>{groupOf.get(p.athlete_id as string) ?? "BELUM DIATUR"}</td>
                    <td>{(p.registration as { ku?: string } | null)?.ku ?? "—"}</td>
                    <td className="whitespace-nowrap">{rupiah(p.total_amount)}</td>
                    <td className="whitespace-nowrap text-brand-700">{rupiah(p.amount_paid)}</td>
                    <td>{p.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length > 50 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">Menampilkan 50 terbaru dari {payments.length} transaksi. Gunakan Export untuk data lengkap.</p>}
          </div>
        )}
      </section>

      {/* Financial report */}
      <section id="financial" className="grid gap-4 lg:grid-cols-3">
        <div className="card-flat">
          <h3 className="card-title mb-3">Financial Summary</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Total Pembayaran Masuk</dt><dd className="font-semibold">{rupiah(totalRevenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">— Uang Event (pendapatan event)</dt><dd className="font-semibold text-brand-700">{rupiah(totalRevenueEvent)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">— Uang Admin</dt><dd className="font-semibold text-brand-700">{rupiah(totalAdminRevenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Total Tagihan (event + admin)</dt><dd className="font-semibold">{rupiah(totalBilled)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">— Uang Event (billed)</dt><dd className="font-semibold text-brand-700">{rupiah(totalBilledEvent)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Outstanding</dt><dd className="font-semibold text-red-600">{rupiah(totalOutstanding)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Transaksi DP</dt><dd className="font-semibold">{dpCount}</dd></div>
          </dl>
        </div>
        <div className="card-flat overflow-x-auto lg:col-span-2">
          <h3 className="card-title mb-3">Per Event / Per Kelompok</h3>
          <table className="table !min-w-[480px]">
            <thead><tr><th>Kelompok</th><th>Tagihan</th><th>Masuk</th></tr></thead>
            <tbody>
              {Array.from(byEvent.entries()).slice(0, 8).map(([name, v]) => (
                <tr key={`e-${name}`}><td>🏁 {name}</td><td className="whitespace-nowrap">{rupiah(v.billed)}</td><td className="whitespace-nowrap text-brand-700">{rupiah(v.paid)}</td></tr>
              ))}
              {Array.from(byGroup.entries()).map(([name, v]) => (
                <tr key={`g-${name}`}><td>{name}</td><td className="whitespace-nowrap">{rupiah(v.billed)}</td><td className="whitespace-nowrap text-brand-700">{rupiah(v.paid)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Harian */}
      {byDate.size > 0 && (
        <section className="card-flat overflow-x-auto">
          <h3 className="card-title mb-3">Pemasukan Harian</h3>
          <div className="flex items-end gap-1" aria-hidden>
            {Array.from(byDate.entries()).slice(-30).map(([d, v]) => {
              const max = Math.max(...Array.from(byDate.values()), 1);
              return (
                <div key={d} title={`${d}: ${rupiah(v)}`} className="w-3 rounded-t bg-brand-500/80" style={{ height: `${Math.max(8, Math.round((v / max) * 64))}px` }} />
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">30 hari terakhir yang memiliki pemasukan (hover untuk detail).</p>
        </section>
      )}

      {/* Cakra report */}
      <section id="cakra" className="card-flat overflow-x-auto">
        <h3 className="card-title mb-3">Cakra Report (per kelompok)</h3>
        <table className="table !min-w-[520px]">
          <thead><tr><th>Kelompok</th><th>Total Atlet</th><th>Aktif</th><th>Tagihan Event</th><th>Masuk</th></tr></thead>
          <tbody>
            {groups.map((g) => {
              const c = g.name;
              const s = groupStats.get(c) ?? { total: 0, active: 0 };
              const f = byGroup.get(c) ?? { billed: 0, paid: 0 };
              if (s.total === 0 && f.billed === 0) return null;
              return (
                <tr key={g.id}>
                  <td className="font-medium">{c}</td>
                  <td>{s.total}</td>
                  <td>{s.active}</td>
                  <td className="whitespace-nowrap">{rupiah(f.billed)}</td>
                  <td className="whitespace-nowrap text-brand-700">{rupiah(f.paid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-slate-400">
        Catatan: Admin Fee sudah termasuk dalam total tagihan tiap transaksi (lihat breakdown di detail event).
        Export Attendance tersedia di halaman Laporan; export keuangan via Import/Export.
      </p>
    </div>
  );
}
