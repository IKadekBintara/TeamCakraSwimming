import { createClient } from "@/lib/supabase/server";
import PaymentVerification from "@/components/PaymentVerification";
import { rupiah, paymentStatusLabel, type PaymentStatus } from "@/lib/events";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES: PaymentStatus[] = ["BELUM_BAYAR", "MENUNGGU_VERIFIKASI", "DP", "LUNAS", "DITOLAK", "CANCELLED"];

function Metric({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${accent ?? ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: { q?: string; status?: string; cakra?: string } }) {
  const supabase = createClient(); const q = searchParams.q?.trim() ?? ""; const status = searchParams.status ?? "ALL"; const cakra = searchParams.cakra ?? "ALL";
  let query = supabase.from("event_payments").select("id,transaction_id,athlete_name,cakra,jumlah_nomor,registration_fee,admin_fee,total_amount,amount_paid,remaining_amount,payment_proof,payment_method,payment_status,notes,event:events(name)").order("created_at", { ascending: false });
  if (q) query = query.ilike("athlete_name", `%${q}%`); if (status !== "ALL") query = query.eq("payment_status", status); if (cakra !== "ALL") query = query.eq("cakra", cakra);
  const [{ data: payments }, { data: summary }] = await Promise.all([query, supabase.from("event_payments").select("total_amount,registration_fee,admin_fee,amount_paid,remaining_amount,payment_status,cakra")]);
  const rows = summary ?? [];
  const totalBill = rows.filter((p) => p.payment_status !== "CANCELLED").reduce((n, p) => n + Number(p.total_amount || 0), 0);
  const totalBillEvent = rows.filter((p) => p.payment_status !== "CANCELLED").reduce((n, p) => n + Number(p.registration_fee || 0), 0);
  const totalPaid = rows.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)).reduce((n, p) => n + Number(p.amount_paid || 0), 0);
  const paidEvent = rows.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)).reduce((n, p) => n + Number(p.registration_fee || 0), 0);
  const pending = rows.filter((p) => p.payment_status === "MENUNGGU_VERIFIKASI").length;
  const unpaid = rows.filter((p) => p.payment_status === "BELUM_BAYAR").length;
  const dpCount = rows.filter((p) => p.payment_status === "DP").length;
  const rejectedCount = rows.filter((p) => p.payment_status === "DITOLAK").length;
  const lunasCount = rows.filter((p) => p.payment_status === "LUNAS").length;
  const cakraSummary = new Map<string, { athletes: number; bills: number; paid: number; count: number }>(); for (const p of rows) { const key = p.cakra || "Tanpa Cakra"; const old = cakraSummary.get(key) ?? { athletes: 0, bills: 0, paid: 0, count: 0 }; old.bills += Number(p.total_amount || 0); old.paid += ["LUNAS", "DP"].includes(p.payment_status) ? Number(p.amount_paid || 0) : 0; old.count += 1; cakraSummary.set(key, old); }
  const pendingRows = (payments ?? []).filter((p) => p.payment_status === "MENUNGGU_VERIFIKASI");
  return <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0">
    <header className="page-header">
      <div>
        <h1 className="page-title">Payment Center</h1>
        <p className="page-subtitle">Pembayaran manual — wajib diverifikasi admin sebelum dihitung sebagai uang masuk.</p>
      </div>
      <Link href="/registrations" className="btn-secondary text-sm">Daftar Pendaftaran</Link>
    </header>

    <section aria-label="Ringkasan pembayaran" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="Total Tagihan (event + admin)" value={rupiah(totalBill)} />
      <Metric label="Uang Event" value={rupiah(totalBillEvent)} hint={`Masuk ${rupiah(paidEvent)}`} accent="!text-brand-600" />
      <Metric label="Uang Masuk" value={rupiah(totalPaid)} hint={`event + admin · verifikasi ${pending}`} />
      <Metric label="Belum Bayar" value={String(unpaid)} accent="!text-red-600" />
    </section>
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="badge-success badge">Lunas {lunasCount}</span>
      <span className="badge-info badge">DP {dpCount}</span>
      <span className="badge-danger badge">Ditolak {rejectedCount}</span>
    </div>

    <div className="card">
      <h2 className="card-title mb-3 !text-base !normal-case !tracking-normal font-semibold text-navy-900">Filter Transaksi</h2>
      <form className="grid gap-3 sm:grid-cols-4">
        <label className="label">Cari atlet
          <input className="input" name="q" defaultValue={q} placeholder="Nama atlet…" />
        </label>
        <label className="label">Status
          <select className="input" name="status" defaultValue={status}>
            <option value="ALL">Semua</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
          </select>
        </label>
        <label className="label">Cakra
          <input className="input" name="cakra" defaultValue={cakra === "ALL" ? "" : cakra} placeholder="Cakra 1" />
        </label>
        <div className="flex items-end gap-2">
          <button className="btn-primary">Filter</button>
          <Link href="/keuangan" className="btn-secondary">Reset</Link>
        </div>
      </form>
    </div>

    <section className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="card-title !text-base !normal-case !tracking-normal font-semibold text-navy-900">Menunggu Verifikasi</h2>
        <span className="badge-warning badge">{pendingRows.length} transaksi</span>
      </div>
      <PaymentVerification payments={pendingRows as never} />
    </section>

    <div className="card overflow-x-auto">
      <h2 className="card-title mb-3 !text-base !normal-case !tracking-normal font-semibold text-navy-900">Rekap per Cakra</h2>
      <table className="table !min-w-[560px]"><thead><tr><th>Cakra</th><th>Pendaftaran</th><th>Tagihan</th><th>Masuk</th><th>Sisa</th></tr></thead><tbody>{Array.from(cakraSummary.entries()).map(([name, s]) => <tr key={name}><td className="font-medium">{name}</td><td>{s.count}</td><td className="whitespace-nowrap">{rupiah(s.bills)}</td><td className="whitespace-nowrap text-brand-700">{rupiah(s.paid)}</td><td className="whitespace-nowrap text-amber-600">{rupiah(Math.max(s.bills - s.paid, 0))}</td></tr>)}</tbody></table>
    </div>
  </div>;
}
