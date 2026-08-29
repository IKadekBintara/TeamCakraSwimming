import { createClient } from "@/lib/supabase/server";
import PaymentVerification from "@/components/PaymentVerification";
import { rupiah, paymentStatusLabel, type PaymentStatus } from "@/lib/events";
import { getCakraGroups } from "@/lib/groups";
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

export default async function FinancePage({ searchParams }: { searchParams: { q?: string; status?: string; group?: string } }) {
  const supabase = createClient();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "ALL";
  const group = searchParams.group ?? "ALL";

  // athlete_id ikut diambil: kelompok ditentukan via training_group_members (bukan kolom cakra legacy).
  let query = supabase.from("event_payments").select("id,transaction_id,athlete_id,athlete_name,jumlah_nomor,registration_fee,admin_fee,total_amount,amount_paid,remaining_amount,payment_proof,payment_method,payment_status,notes,event:events(name)").order("created_at", { ascending: false });
  if (q) query = query.ilike("athlete_name", `%${q}%`);
  if (status !== "ALL") query = query.eq("payment_status", status);

  const [{ data: payments }, { data: summaryRows }, groups] = await Promise.all([
    query,
    supabase.from("event_payments").select("athlete_id,total_amount,registration_fee,admin_fee,amount_paid,remaining_amount,payment_status"),
    getCakraGroups(),
  ]);
  const rows = summaryRows ?? [];

  // Peta kelompok: athlete_id → nama (satu sumber kebenaran: training_group_members).
  let groupFilterIds: Set<string> | null = null;
  if (group !== "ALL") {
    const { data: gm } = await supabase.from("training_group_members").select("athlete_id").eq("group_id", group).is("left_at", null);
    groupFilterIds = new Set((gm ?? []).map((m) => m.athlete_id as string));
  }
  const { data: members } = await supabase.from("training_group_members").select("athlete_id, group_id").is("left_at", null);
  const groupNameOfId = (athleteId: string | null | undefined): string => {
    if (!athleteId) return "BELUM DIATUR";
    const gid = (members ?? []).find((m) => m.athlete_id === athleteId)?.group_id as string | undefined;
    return gid ? (groups.find((g) => g.id === gid)?.name ?? "BELUM DIATUR") : "BELUM DIATUR";
  };

  const visibleRows = groupFilterIds ? rows.filter((p) => groupFilterIds!.has(p.athlete_id as string)) : rows;
  const totalBill = visibleRows.filter((p) => p.payment_status !== "CANCELLED").reduce((n, p) => n + Number(p.total_amount || 0), 0);
  const totalBillEvent = visibleRows.filter((p) => p.payment_status !== "CANCELLED").reduce((n, p) => n + Number(p.registration_fee || 0), 0);
  const totalPaid = visibleRows.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)).reduce((n, p) => n + Number(p.amount_paid || 0), 0);
  const paidEvent = visibleRows.filter((p) => ["LUNAS", "DP"].includes(p.payment_status)).reduce((n, p) => n + Number(p.registration_fee || 0), 0);
  const pending = visibleRows.filter((p) => p.payment_status === "MENUNGGU_VERIFIKASI").length;
  const unpaid = visibleRows.filter((p) => p.payment_status === "BELUM_BAYAR").length;
  const dpCount = visibleRows.filter((p) => p.payment_status === "DP").length;
  const rejectedCount = visibleRows.filter((p) => p.payment_status === "DITOLAK").length;
  const lunasCount = visibleRows.filter((p) => p.payment_status === "LUNAS").length;

  const groupSummary = new Map<string, { bills: number; paid: number; count: number }>();
  for (const p of visibleRows) {
    const key = groupNameOfId(p.athlete_id as string);
    const old = groupSummary.get(key) ?? { bills: 0, paid: 0, count: 0 };
    old.bills += Number(p.total_amount || 0);
    old.paid += ["LUNAS", "DP"].includes(p.payment_status) ? Number(p.amount_paid || 0) : 0;
    old.count += 1;
    groupSummary.set(key, old);
  }

  const pendingRows = (groupFilterIds
    ? (payments ?? []).filter((p) => groupFilterIds!.has(p.athlete_id as string))
    : (payments ?? [])
  ).filter((p) => p.payment_status === "MENUNGGU_VERIFIKASI");

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
        <label className="label">Kelompok
          <select className="input" name="group" defaultValue={group}>
            <option value="ALL">Semua</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
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
      <h2 className="card-title mb-3 !text-base !normal-case !tracking-normal font-semibold text-navy-900">Rekap per Kelompok</h2>
      <table className="table !min-w-[560px]"><thead><tr><th>Kelompok</th><th>Pendaftaran</th><th>Tagihan</th><th>Masuk</th><th>Sisa</th></tr></thead><tbody>{Array.from(groupSummary.entries()).map(([name, s]) => <tr key={name}><td className="font-medium">{name}</td><td>{s.count}</td><td className="whitespace-nowrap">{rupiah(s.bills)}</td><td className="whitespace-nowrap text-brand-700">{rupiah(s.paid)}</td><td className="whitespace-nowrap text-amber-600">{rupiah(Math.max(s.bills - s.paid, 0))}</td></tr>)}</tbody></table>
    </div>
  </div>;
}
