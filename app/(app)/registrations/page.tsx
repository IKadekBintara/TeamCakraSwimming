import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { rupiah, paymentStatusLabel, type PaymentStatus } from "@/lib/events";
import { CAKRA_GROUPS } from "@/lib/events";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES: PaymentStatus[] = ["BELUM_BAYAR", "MENUNGGU_VERIFIKASI", "DP", "LUNAS", "DITOLAK", "CANCELLED"];
const PAGE_SIZE = 25;

function badgeClass(status: string) {
  switch (status) {
    case "LUNAS": return "badge-success badge";
    case "DP": return "badge-info badge";
    case "MENUNGGU_VERIFIKASI": return "badge-warning badge";
    case "BELUM_BAYAR": return "badge-danger badge";
    default: return "badge-neutral badge";
  }
}

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: {
    q?: string; event?: string; cakra?: string; ku?: string;
    race?: string; pay?: string; page?: string;
  };
}) {
  const supabase = createClient();
  const q = searchParams.q?.trim() ?? "";
  const fEvent = searchParams.event ?? "ALL";
  const fCakra = searchParams.cakra ?? "ALL";
  const fKu = searchParams.ku ?? "ALL";
  const fRace = searchParams.race ?? "ALL";
  const fPay = searchParams.pay ?? "ALL";
  const page = Math.max(1, Number(searchParams.page || 1));
  const from = (page - 1) * PAGE_SIZE;

  // Opsi filter
  const [{ data: events }, { data: kus }] = await Promise.all([
    supabase.from("events").select("id, name").order("event_date", { ascending: false }),
    supabase.from("event_registrations").select("ku").order("ku"),
  ]);
  const kuOptions = Array.from(new Set((kus ?? []).map((k) => k.ku))).filter(Boolean).sort();

  // Query utama — KU hidup di event_registrations (bukan event_payments).
  let query = supabase
    .from("event_payments")
    .select("id, transaction_id, registration_id, athlete_id, athlete_name, cakra, registration_fee, admin_fee, total_amount, amount_paid, remaining_amount, payment_status, payment_method, created_at, event:events(id,name), registration:event_registrations(ku,status)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.ilike("athlete_name", `%${q}%`);
  if (fEvent !== "ALL") query = query.eq("event_id", fEvent);
  if (fCakra !== "ALL") query = query.eq("cakra", fCakra);
  if (fKu !== "ALL") query = query.eq("registration.ku", fKu);
  if (fPay !== "ALL") query = query.eq("payment_status", fPay);
  const { data: rows, count } = await query;

  // Filter race dilakukan via entries → event_registrations.payment_id → event_payments.id
  let raceFilteredIds: Set<string> | null = null;
  if (fRace !== "ALL") {
    const { data: entries } = await supabase
      .from("event_registration_entries")
      .select("registration:event_registrations(payment_id)")
      .eq("race_id", fRace);
    raceFilteredIds = new Set(
      (entries ?? [])
        .map((e) => {
          const reg = e.registration as unknown;
          return Array.isArray(reg) ? reg[0]?.payment_id : (reg as { payment_id?: string } | null)?.payment_id;
        })
        .filter((x): x is string => typeof x === "string")
    );
  }
  const filtered = raceFilteredIds ? (rows ?? []).filter((r) => raceFilteredIds!.has(r.id)) : rows ?? [];

  // Daftar race untuk dropdown (mengikuti pilihan event bila ada)
  let raceOptions: { id: string; name: string }[] = [];
  if (fEvent !== "ALL") {
    const { data: races } = await supabase.from("event_races").select("id, name").eq("event_id", fEvent).order("sort_order");
    raceOptions = races ?? [];
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (over: Record<string, string>) => {
    const sp = new URLSearchParams({ q, event: fEvent, cakra: fCakra, ku: fKu, race: fRace, pay: fPay, page: String(page), ...over });
    return `/registrations?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Pendaftaran Event</h1>
          <p className="page-subtitle">{count ?? 0} pendaftaran • pembayaran manual terverifikasi admin</p>
        </div>
      </header>

      <form method="get" className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="label sm:col-span-2">Cari atlet
          <input className="input" name="q" defaultValue={q} placeholder="Nama atlet…" />
        </label>
        <label className="label">Event
          <select className="input" name="event" defaultValue={fEvent}>
            <option value="ALL">Semua</option>
            {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="label">Cakra
          <select className="input" name="cakra" defaultValue={fCakra}>
            <option value="ALL">Semua</option>
            {CAKRA_GROUPS.map((c) => <option key={c}>{c}</option>)}
            <option>Tidak tersedia</option>
          </select>
        </label>
        <label className="label">KU
          <select className="input" name="ku" defaultValue={fKu}>
            <option value="ALL">Semua</option>
            {kuOptions.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="label">Nomor Lomba
          <select className="input" name="race" defaultValue={fRace} disabled={fEvent === "ALL"}>
            <option value="ALL">Semua</option>
            {raceOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="label">Status Bayar
          <select className="input" name="pay" defaultValue={fPay}>
            <option value="ALL">Semua</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className="btn-primary">Terapkan Filter</button>
          <Link href="/registrations" className="btn-secondary">Reset</Link>
        </div>
      </form>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Tidak ada pendaftaran pada filter ini.</p>
          <p className="empty-state-desc">Coba longgarkan filter atau reset pencarian.</p>
          <Link href="/registrations" className="btn-secondary mt-2 text-sm">Reset Filter</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table !min-w-[880px]">
            <thead>
              <tr><th>Atlet</th><th>Event</th><th>Cakra</th><th>KU</th><th>Uang Event</th><th>Admin</th><th>Total</th><th>Dibayar</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ev = r.event as { id?: string; name?: string } | null;
                const reg = r.registration as { ku?: string; status?: string } | null;
                const regKu = reg?.ku ?? "";
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium">{r.athlete_name}</p>
                      <p className="text-xs text-slate-400">{r.transaction_id?.slice(0, 8)}…</p>
                    </td>
                    <td className="max-w-[180px] truncate">
                      {ev?.id
                        ? <Link href={`/events/${ev.id}`} className="text-brand-700 hover:underline">{ev.name}</Link>
                        : "—"}
                      {reg?.status && <span className="ml-1 text-xs text-slate-400">({reg.status})</span>}
                    </td>
                    <td>{r.cakra || "—"}</td>
                    <td>{regKu || "—"}</td>
                    <td className="whitespace-nowrap">{rupiah(r.registration_fee)}</td>
                    <td className="whitespace-nowrap text-slate-500">{rupiah(r.admin_fee)}</td>
                    <td className="whitespace-nowrap font-medium">{rupiah(r.total_amount)}</td>
                    <td className="whitespace-nowrap text-brand-700">{rupiah(r.amount_paid)}</td>
                    <td><span className={badgeClass(r.payment_status)}>{paymentStatusLabel(r.payment_status as PaymentStatus)}</span></td>
                    <td><Link href={`/keuangan?q=${encodeURIComponent(r.athlete_name)}`} className="text-xs font-medium text-brand-700 hover:underline">Buka</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(totalPages > 1) && (
        <nav aria-label="Navigasi halaman" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Halaman {page} dari {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs({ page: String(page - 1) })} className="btn-secondary px-3 py-1.5">← Sebelumnya</Link>}
            {page < totalPages && <Link href={qs({ page: String(page + 1) })} className="btn-secondary px-3 py-1.5">Berikutnya →</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
