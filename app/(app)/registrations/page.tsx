import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { rupiah, paymentStatusLabel, type PaymentStatus } from "@/lib/events";
import { getCakraGroups } from "@/lib/groups";
import DeleteRegistrationButton from "./DeleteRegistrationButton";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES: PaymentStatus[] = ["BELUM_BAYAR", "MENUNGGU_VERIFIKASI", "DP", "LUNAS", "DITOLAK", "CANCELLED"];
const PAGE_SIZE = 25;

function badgeClass(status: string) {
  switch (status) {
    case "LUNAS": return "badge-success badge";
    case "DP": return "badge-info badge";
    case "MENUNGGU_VERIFIKASI": return "badge-warning badge";
    case "BELUM_BAYAR": return "badge-danger badge";
    case "CANCELLED": return "badge-neutral badge";
    default: return "badge-neutral badge";
  }
}

/** Opsi sorting. Default = terbaru mendaftar (perilaku lama). */
type SortValue = "newest" | "oldest" | "name_asc" | "name_desc" | "ku_asc" | "ku_desc" | "pay_asc" | "pay_desc";
const SORT_OPTIONS: { value: SortValue; label: string; col?: "created_at" | "athlete_name"; asc?: boolean }[] = [
  { value: "newest", label: "Terbaru mendaftar", col: "created_at", asc: false },
  { value: "oldest", label: "Terlama mendaftar", col: "created_at", asc: true },
  { value: "name_asc", label: "Nama A–Z", col: "athlete_name", asc: true },
  { value: "name_desc", label: "Nama Z–A", col: "athlete_name", asc: false },
  { value: "ku_asc", label: "KU terkecil → terbesar" },
  { value: "ku_desc", label: "KU terbesar → terkecil" },
  { value: "pay_asc", label: "Belum Bayar → Lunas" },
  { value: "pay_desc", label: "Lunas → Belum Bayar" },
];
/** Sorting yang butuh comparator khusus (dilakukan in-memory atas seluruh hasil filter). */
const MEM_SORTS: SortValue[] = ["ku_asc", "ku_desc", "pay_asc", "pay_desc"];

/** Urutan logis KU — BUKAN alphabetical: tahun lahir < level Romawi ("I".."V"); tak dikenal selalu di akhir. */
function kuSortKey(ku: string): [number, number] {
  const s = (ku || "").trim().toUpperCase().replace(/^KU\s+/, "");
  if (/^\d{4}/.test(s)) return [0, parseInt(s.slice(0, 4), 10)];
  const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
  if (ROMAN[s] !== undefined) return [1, ROMAN[s]];
  return [2, 0];
}

/** Rank status pembayaran utk sorting semantik (berdasar nilai DB, bukan teks tampilan). */
function payRank(status: string): number {
  switch (status) {
    case "BELUM_BAYAR": return 0;
    case "DP": return 1;
    case "MENUNGGU_VERIFIKASI": return 2;
    case "DITOLAK": return 3;
    case "CANCELLED": return 4;
    case "LUNAS": return 5;
    default: return 6;
  }
}

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: {
    q?: string; event?: string; group?: string; ku?: string;
    race?: string; pay?: string; page?: string; sort?: string;
  };
}) {
  const supabase = createClient();
  const q = searchParams.q?.trim() ?? "";
  const fEvent = searchParams.event ?? "ALL";
  const fGroup = searchParams.group ?? "ALL";
  const fKu = searchParams.ku ?? "ALL";
  const fRace = searchParams.race ?? "ALL";
  const fPay = searchParams.pay ?? "ALL";

  const sortOpt = SORT_OPTIONS.find((s) => s.value === searchParams.sort) ?? SORT_OPTIONS[0];
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const from = (page - 1) * PAGE_SIZE;

  const [{ data: events }, { data: kus }] = await Promise.all([
    supabase.from("events").select("id, name").order("event_date", { ascending: false }),
    supabase.from("event_registrations").select("ku").order("ku"),
  ]);
  const kuOptions = Array.from(new Set((kus ?? []).map((k) => k.ku))).filter(Boolean).sort();

  // Query utama — KU hidup di event_registrations (bukan event_payments).
  const useMemSort = MEM_SORTS.includes(sortOpt.value);
  const PAY_SELECT = "id, transaction_id, registration_id, athlete_id, athlete_name, registration_fee, admin_fee, total_amount, amount_paid, remaining_amount, payment_status, payment_method, created_at, event:events(id,name), registration:event_registrations(ku,status)";
  let query = supabase
    .from("event_payments")
    .select(PAY_SELECT, { count: "exact" })
    .order(sortOpt.col ?? "created_at", { ascending: sortOpt.asc ?? false })
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.ilike("athlete_name", `%${q}%`);
  if (fEvent !== "ALL") query = query.eq("event_id", fEvent);
  if (fPay !== "ALL") query = query.eq("payment_status", fPay);
  const { data: rows, count } = await query;

  // Sorting KU/pembayaran butuh comparator logis → ambil SEMUA hasil filter (tanpa range),
  // urutkan in-memory, lalu paginasi manual. Nomor urut & offset tetap konsisten.
  let allRows: NonNullable<typeof rows> = rows ?? [];
  if (useMemSort && count != null && count > PAGE_SIZE) {
    let allQ = supabase.from("event_payments").select(PAY_SELECT).order("created_at", { ascending: false });
    if (q) allQ = allQ.ilike("athlete_name", `%${q}%`);
    if (fEvent !== "ALL") allQ = allQ.eq("event_id", fEvent);
    if (fPay !== "ALL") allQ = allQ.eq("payment_status", fPay);
    const { data: allData } = await allQ;
    allRows = allData ?? [];
  }

  // Filter kelompok: athlete_id → training_group_members (satu sumber kebenaran).
  if (fGroup !== "ALL") {
    const { data: gMembers } = await supabase.from("training_group_members").select("athlete_id").eq("group_id", fGroup).is("left_at", null);
    const gSet = new Set((gMembers ?? []).map((m) => m.athlete_id));
    allRows = allRows.filter((r) => gSet.has(r.athlete_id as string));
  }

  let displayRows = allRows;
  if (useMemSort) {
    const dir = sortOpt.value.endsWith("_asc") ? 1 : -1;
    const sorted = [...allRows].sort((a, b) => {
      const regA = a.registration as { ku?: string } | null;
      const regB = b.registration as { ku?: string } | null;
      const ka = sortOpt.value.startsWith("ku_") ? kuSortKey(regA?.ku ?? "") : payRank(a.payment_status);
      const kb = sortOpt.value.startsWith("ku_") ? kuSortKey(regB?.ku ?? "") : payRank(b.payment_status);
      const cmpA = Array.isArray(ka) ? ka : [ka];
      const cmpB = Array.isArray(kb) ? kb : [kb];
      for (let i = 0; i < Math.max(cmpA.length, cmpB.length); i++) {
        const d = ((cmpA[i] ?? 0) as number) - ((cmpB[i] ?? 0) as number);
        if (d !== 0) return d * dir;
      }
      return a.athlete_name.localeCompare(b.athlete_name, "id");
    });
    displayRows = sorted.slice(from, from + PAGE_SIZE);
  }

  // Filter race: entries → registration_id → event_payments.registration_id
  // (kolom event_registrations.payment_id TIDAK ADA di schema).
  if (fRace !== "ALL") {
    const { data: entries } = await supabase
      .from("event_registration_entries")
      .select("registration_id")
      .eq("race_id", fRace);
    const regIdSet = new Set((entries ?? []).map((e) => e.registration_id as string));
    displayRows = displayRows.filter((r) => regIdSet.has(r.registration_id as string));
  }

  // Nama live per athlete_id (fallback bila snapshot athlete_name belum tersinkron
  // setelah rename). Identity tetap athlete_id; nama hanya tampilan.
  const liveNames = new Map<string, string>();
  const needNameIds = Array.from(new Set(displayRows.map((r) => r.athlete_id).filter((x): x is string => typeof x === "string")));
  if (needNameIds.length > 0) {
    const [{ data: nameRows }, { data: gMembers }] = await Promise.all([
      supabase.from("athletes").select("id, full_name").in("id", needNameIds),
      supabase.from("training_group_members").select("athlete_id, group_id").in("athlete_id", needNameIds).is("left_at", null),
    ]);
    for (const n of nameRows ?? []) liveNames.set(n.id, n.full_name);
    for (const m of gMembers ?? []) liveNames.set(`grp:${m.athlete_id}`, m.group_id);
  }

  // Daftar race untuk dropdown (mengikuti pilihan event bila ada)
  let raceOptions: { id: string; name: string }[] = [];
  if (fEvent !== "ALL") {
    const { data: races } = await supabase.from("event_races").select("id, name").eq("event_id", fEvent).order("sort_order");
    raceOptions = races ?? [];
  }

  const groups = await getCakraGroups();
  const groupNameOf = (athleteId: string | null): string => {
    if (!athleteId) return "";
    const gid = liveNames.get(`grp:${athleteId}`);
    return gid ? (groups.find((g) => g.id === gid)?.name ?? "") : "";
  };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (over: Record<string, string>) => {
    const sp = new URLSearchParams({ q, event: fEvent, group: fGroup, ku: fKu, race: fRace, pay: fPay, sort: sortOpt.value, page: String(page), ...over });
    return `/registrations?${sp.toString()}`;
  };

  return <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
    <header>
      <h1 className="text-2xl font-bold">Pendaftaran Event</h1>
      <p className="text-sm text-slate-500">Total {count ?? 0} pendaftaran · Pembayaran manual terverifikasi admin.</p>
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
      <label className="label">Kelompok
        <select className="input" name="group" defaultValue={fGroup}>
          <option value="ALL">Semua</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
      <label className="label">Urutkan
        <select className="input" name="sort" defaultValue={sortOpt.value}>
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
        <button type="submit" className="btn-primary">Terapkan Filter</button>
        <Link href="/registrations" className="btn-secondary">Reset</Link>
      </div>
    </form>

    {displayRows.length === 0 ? (
      <div className="empty-state">
        <p className="empty-state-title">Tidak ada pendaftaran pada filter ini.</p>
        <p className="empty-state-desc">Coba longgarkan filter atau reset pencarian.</p>
        <Link href="/registrations" className="btn-secondary mt-2 text-sm">Reset Filter</Link>
      </div>
    ) : (
      <div className="table-wrap">
        <table className="table !min-w-[880px]">
          <thead>
            <tr><th>Atlet</th><th>Event</th><th>Kelompok</th><th>KU</th><th>Uang Event</th><th>Admin</th><th>Total</th><th>Dibayar</th><th>Status</th><th>Detail</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => {
              const ev = r.event as { id?: string; name?: string } | null;
              const reg = r.registration as { ku?: string; status?: string } | null;
              const regKu = reg?.ku ?? "";
              const regId = r.registration_id as string | undefined;
              return (
                <tr key={r.id}>
                  <td>
                    <div className="flex items-baseline gap-2">
                      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-400" aria-label={`Nomor urut ${from + i + 1}`}>{from + i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium">{(r.athlete_id ? liveNames.get(r.athlete_id) : null) ?? r.athlete_name}</p>
                        <p className="text-xs text-slate-400">{r.transaction_id?.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[180px] truncate">
                    {ev?.id
                      ? <Link href={`/events/${ev.id}`} className="text-brand-700 hover:underline">{ev.name}</Link>
                      : "—"}
                    {reg?.status && <span className="ml-1 text-xs text-slate-400">({reg.status})</span>}
                  </td>
                  <td>{groupNameOf(r.athlete_id as string) || "BELUM DIATUR"}</td>
                  <td>{regKu || "—"}</td>
                  <td className="whitespace-nowrap">{rupiah(r.registration_fee)}</td>
                  <td className="whitespace-nowrap text-slate-500">{rupiah(r.admin_fee)}</td>
                  <td className="whitespace-nowrap font-medium">{rupiah(r.total_amount)}</td>
                  <td className="whitespace-nowrap text-brand-700">{rupiah(r.amount_paid)}</td>
                  <td><span className={badgeClass(r.payment_status)}>{paymentStatusLabel(r.payment_status as PaymentStatus)}</span></td>
                  <td><Link href={`/keuangan?q=${encodeURIComponent(r.athlete_name)}`} className="text-xs font-medium text-brand-700 hover:underline">Buka</Link></td>
                  <td>{regId && <DeleteRegistrationButton registrationId={regId} athleteName={liveNames.get(r.athlete_id as string) ?? r.athlete_name} eventName={ev?.name ?? "-"} />}</td>
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
  </div>;
}
