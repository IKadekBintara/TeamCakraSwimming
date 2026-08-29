import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/supabase/auth-helper";
import Link from "next/link";
import { redirect } from "next/navigation";
import PerformanceResultForm from "@/components/PerformanceResultForm";
import { formatTime, STROKES } from "@/lib/performance";
import { getCakraGroups, calculateDolphinKu } from "@/lib/events";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type Row = {
  id: string;
  athlete_id: string;
  recorded_at: string;
  stroke: string;
  distance: number;
  time_cs: number | null;
  pool_length: number | null;
  event_id: string | null;
  meet_name: string | null;
  notes: string | null;
  rank: number | null;
  athletes: { full_name?: string; cakra?: string | null; birth_date?: string | null } | { full_name?: string; cakra?: string | null; birth_date?: string | null }[] | null;
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: { q?: string; cakra?: string; ku?: string; stroke?: string; from?: string; to?: string; event?: string; page?: string; edit?: string };
}) {
  const supabase = createClient();
  const { user } = await getAuth();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role ?? "parent";
  if (!["admin", "operator", "coach", "group_leader", "ketua_kelompok"].includes(role)) redirect("/dashboard");

  const q = searchParams.q?.trim() ?? "";
  const fGroup = searchParams.group ?? "ALL";
  const fKu = searchParams.ku ?? "ALL";
  const fStroke = searchParams.stroke ?? "ALL";
  const fFrom = searchParams.from ?? "";
  const fTo = searchParams.to ?? "";
  const fEvent = searchParams.event ?? "ALL";
  const page = Math.max(1, Number(searchParams.page || 1));
  const rngFrom = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("athlete_performance_results")
    .select("id, athlete_id, recorded_at, stroke, distance, time_cs, pool_length, event_id, meet_name, notes, rank, athletes(full_name, cakra, birth_date)", { count: "exact" })
    .order("recorded_at", { ascending: false })
    .range(rngFrom, rngFrom + PAGE_SIZE - 1);
  if (fStroke !== "ALL") query = query.eq("stroke", fStroke);
  if (fFrom) query = query.gte("recorded_at", fFrom);
  if (fTo) query = query.lte("recorded_at", fTo);
  if (fEvent !== "ALL") query = query.eq("event_id", fEvent);

  // Cakra & nama atlet difilter di server kecil setelah fetch (relasi nested).
  const { data: rawRows, count } = await query;
  const rowsAll = ((rawRows ?? []) as unknown as Row[]).filter((r) => {
    const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
    // filter group akan dilakukan dengan relasi
    if (fGroup !== "ALL") {
      // perlu ambil group_id dari relasi di sini; kita skip dulu
    }
    if (q && !(a?.full_name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (fKu !== "ALL" && calculateDolphinKu(a?.birth_date) !== fKu) return false;
    return true;
  });

  // Opsi KU unik dari data (configurable, tidak hard-code)
  const kuOptions = Array.from(
    new Set(((rawRows ?? []) as unknown as Row[])
      .map((r) => {
        const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
        return calculateDolphinKu(a?.birth_date);
      })
      .filter(Boolean))
  ).sort();

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Hasil yang sedang diedit (via ?edit=<id>) — hanya jika role berwenang
  let editRow: {
    id: string;
    athlete_id: string;
    athlete_name?: string;
    recorded_at: string;
    stroke: string;
    distance: number;
    time_cs: number | null;
    pool_length: number | null;
    meet_name: string | null;
    notes: string | null;
    rank: number | null;
  } | null = null;
  if (searchParams.edit) {
    const { data: er } = await supabase
      .from("athlete_performance_results")
      .select("id, athlete_id, recorded_at, stroke, distance, time_cs, pool_length, meet_name, notes, rank, athletes(full_name)")
      .eq("id", searchParams.edit)
      .maybeSingle();
    if (er) {
      const ea = Array.isArray(er.athletes) ? er.athletes[0] : er.athletes;
      editRow = {
        id: er.id,
        athlete_id: er.athlete_id,
        athlete_name: (ea as { full_name?: string } | null)?.full_name,
        recorded_at: er.recorded_at,
        stroke: er.stroke,
        distance: er.distance,
        time_cs: er.time_cs,
        pool_length: er.pool_length,
        meet_name: er.meet_name,
        notes: er.notes,
        rank: er.rank,
      };
    }
  }

  const [{ data: athleteOpts }, { data: eventOpts }] = await Promise.all([
    supabase.from("athletes").select("id, full_name").order("full_name"),
    supabase.from("events").select("id, name").order("event_date", { ascending: false }).limit(50),
  ]);

  const qs = (over: Record<string, string>) => {
    const sp = new URLSearchParams({ q, group: fGroup, ku: fKu, stroke: fStroke, from: fFrom, to: fTo, event: fEvent, page: String(page), ...over });
    return `/performance?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Performance Management</h1>
          <p className="page-subtitle">{count ?? 0} hasil tercatat · PB dihitung otomatis per kombinasi stroke + distance</p>
        </div>
        <a href="/api/export?kind=performance" className="btn-secondary shrink-0">Export Excel</a>
      </header>

      <details className="group" open={!!editRow}>
        <summary className="btn-primary inline-block cursor-pointer select-none">{editRow ? "✎ Edit Hasil" : "+ Catat Hasil Baru"}</summary>
        <div className="mt-3">
          {editRow ? (
            <>
              <p className="mb-2 text-sm text-slate-500">Mengedit hasil {editRow.athlete_name ? `milik ${editRow.athlete_name}` : ""} — atlet tidak dapat diubah pada mode edit.</p>
              <PerformanceResultForm
                athletes={((athleteOpts ?? []) as { id: string; full_name: string }[])}
                events={(eventOpts ?? []) as { id: string; name: string }[]}
                canDelete={role === "admin"}
                editResult={editRow}
              />
              <Link href="/performance" className="mt-2 inline-block text-sm text-brand-700 hover:underline">← Batal edit, kembali ke daftar</Link>
            </>
          ) : (
            <PerformanceResultForm athletes={(athleteOpts ?? []) as { id: string; full_name: string }[]} events={(eventOpts ?? []) as { id: string; name: string }[]} />
          )}
        </div>
      </details>

      <form method="get" className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="label sm:col-span-2">Cari atlet
          <input className="input" name="q" defaultValue={q} placeholder="Nama atlet…" />
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
        <label className="label">Stroke
          <select className="input" name="stroke" defaultValue={fStroke}>
            <option value="ALL">Semua</option>
            {STROKES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="label">Event
          <select className="input" name="event" defaultValue={fEvent}>
            <option value="ALL">Semua</option>
            {(eventOpts ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="label">Dari
          <input className="input" type="date" name="from" defaultValue={fFrom} />
        </label>
        <label className="label">Sampai
          <input className="input" type="date" name="to" defaultValue={fTo} />
        </label>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button type="submit" className="btn-primary">Terapkan Filter</button>
          <Link href="/performance" className="btn-secondary">Reset</Link>
        </div>
      </form>

      {rowsAll.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No performance data yet</p>
          <p className="empty-state-desc">Belum ada hasil pada filter ini. Catat hasil pertama lewat form di atas.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table !min-w-[900px]">
            <thead><tr><th>Tanggal</th><th>Atlet</th><th>Cakra</th><th>Nomor</th><th>Waktu</th><th>Kolam</th><th>Meet / Event</th><th>Rank</th><th>Aksi</th></tr></thead>
            <tbody>
              {rowsAll.map((r) => {
                const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
                const evOpt = (eventOpts ?? []).find((e) => e.id === r.event_id);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-slate-500">{r.recorded_at}</td>
                    <td className="font-medium"><Link href={`/atlet/${r.athlete_id}`} className="text-brand-700 hover:underline">{a?.full_name ?? "—"}</Link></td>
                    <td>{a?.cakra ?? "—"}</td>
                    <td>{r.stroke} {r.distance}m</td>
                    <td className="font-semibold">{formatTime(r.time_cs)}</td>
                    <td>{r.pool_length ? `${r.pool_length} m` : "—"}</td>
                    <td className="max-w-[180px] truncate">{evOpt?.name ?? r.meet_name ?? "—"}</td>
                    <td>{r.rank ?? "—"}</td>
                    <td>
                      <Link href={`/performance?edit=${r.id}`} className="text-brand-700 hover:underline" aria-label={`Edit hasil ${a?.full_name ?? ""} ${r.stroke} ${r.distance}m`}>Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Navigasi halaman" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Halaman {page} dari {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs({ page: String(page - 1) })} className="btn-secondary px-3 py-1.5">← Sebelumnya</Link>}
            {page < totalPages && <Link href={qs({ page: String(page + 1) })} className="btn-secondary px-3 py-1.5">Berikutnya →</Link>}
          </div>
        </nav>
      )}

      <p className="text-xs text-slate-400">
        Untuk mengedit/menghapus hasil: buka profil atlet — form edit tersedia untuk coach/admin sesuai scope.
        Delete hanya untuk admin dan selalu tercatat di audit log.
      </p>
    </div>
  );
}
