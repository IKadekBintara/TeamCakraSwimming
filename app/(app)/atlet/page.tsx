import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { STATUS_LABELS } from "@/types";
import { calculateDolphinKu } from "@/lib/events";
import { getCakraGroups } from "@/lib/groups";
import { getProfile } from "@/lib/page-guard";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "ACTIVE", label: "Aktif" },
  { key: "INACTIVE", label: "Nonaktif" },
  { key: "LEFT_CLUB", label: "Keluar" },
  { key: "ALL", label: "Semua" },
];

const SORTS = [
  { key: "name", label: "Nama A→Z" },
  { key: "name_desc", label: "Nama Z→A" },
  { key: "newest", label: "Terbaru Bergabung" },
];
const PAGE_SIZE = 25;

export default async function AtletPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; group?: string; ku?: string; sort?: string; page?: string };
}) {
  // Atlet/parent tidak melihat daftar seluruh atlet — diarahkan ke halaman pribadi.
  const viewer = await getProfile();
  if (!["admin", "operator", "coach", "group_leader", "ketua_kelompok"].includes((viewer?.role as string) ?? "")) redirect("/profil-saya");

  const supabase = createClient();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "ACTIVE";
  const fGroup = searchParams.group ?? "ALL";
  const fKu = searchParams.ku ?? "ALL";
  const sort = SORTS.some((s) => s.key === searchParams.sort) ? searchParams.sort! : "name";
  const page = Math.max(1, Number(searchParams.page || 1));
  const from = (page - 1) * PAGE_SIZE;

  // KU dihitung dari tanggal lahir (aturan Dolphin yang sama dengan registrasi)
  const kuFromBirth = (birthDate: string | null) => calculateDolphinKu(birthDate);

  let query = supabase
    .from("athletes")
    .select("id, full_name, nickname, birth_date, gender, photo_url, program, cakra, status, whatsapp, join_date, left_at", { count: "exact" })
    .range(from, from + PAGE_SIZE - 1);

  if (q) query = query.or(`full_name.ilike.%${q}%,nickname.ilike.%${q}%`);
  if (status !== "ALL") query = query.eq("status", status);
  // filter group akan dilakukan setelah fetch relasi
  if (sort === "name") query = query.order("full_name");
  else if (sort === "name_desc") query = query.order("full_name", { ascending: false });
  else query = query.order("join_date", { ascending: false });
  const { data: athletes, count } = await query;

  // Filter KU dihitung di server setelah fetch halaman (jumlah baris kecil per halaman).
  const rows = (athletes ?? []).filter((a) => fKu === "ALL" || kuFromBirth(a.birth_date) === fKu);

  // Kelompok aktif per atlet
  const ids = rows.map((a) => a.id);
  const { data: memberships } = ids.length
    ? await supabase
        .from("training_group_members")
        .select("athlete_id, group_id")
        .in("athlete_id", ids)
        .is("left_at", null)
    : { data: [] as never[] };

  // Ambil daftar grup untuk mapping ID -> nama
  const groups = await getCakraGroups();
  const groupMap = Object.fromEntries(groups.map(g => [g.id, g.name]));

  const groupOf: Record<string, string> = {};
  for (const m of memberships ?? []) {
    groupOf[m.athlete_id] = groupMap[m.group_id] || "";
  }

  // Filter berdasarkan group jika dipilih
  let filteredRows = rows;
  if (fGroup !== "ALL") {
    const groupName = groupMap[fGroup];
    filteredRows = rows.filter(a => groupOf[a.id] === groupName);
  } else {
    filteredRows = rows;
  }

  const counts = { ACTIVE: 0, INACTIVE: 0, LEFT_CLUB: 0 };
  {
    const { data } = await supabase.from("athletes").select("status");
    for (const a of data ?? []) counts[a.status as keyof typeof counts]++;
  }

  // Opsi KU untuk dropdown (dari seluruh atlet, bukan hanya halaman ini)
  const { data: allBirths } = await supabase.from("athletes").select("birth_date");
  const kuOptions = Array.from(new Set((allBirths ?? []).map((a) => kuFromBirth(a.birth_date)))).filter((k) => k !== "KU belum tersedia").sort();

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (over: Record<string, string>) => {
    const sp = new URLSearchParams({ q, status, group: fGroup, ku: fKu, sort, page: String(page), ...over });
    return `/atlet?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Atlet</h1>
          <p className="page-subtitle">{count ?? 0} atlet TEAM CAKRA SWIMMING</p>
        </div>
        <Link href="/atlet/tambah" className="btn-primary shrink-0">
          + Tambah Atlet
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ status: f.key, page: "1" })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f.key
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            {f.key !== "ALL" && (
              <span className="ml-1.5 text-xs opacity-75">{counts[f.key as keyof typeof counts]}</span>
            )}
          </Link>
        ))}
      </div>

      <form method="get" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="status" value={status} />
        <label className="label sm:col-span-2">Cari
          <input name="q" defaultValue={q} placeholder="Nama atau panggilan…" className="input" />
        </label>
        <label className="label">Kelompok
          <select name="group" defaultValue={fGroup} className="input">
            <option value="ALL">Semua</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="label">KU
          <select name="ku" defaultValue={fKu} className="input">
            <option value="ALL">Semua</option>
            {kuOptions.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="label">Urutkan
          <select name="sort" defaultValue={sort} className="input">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2 lg:col-span-5">
          <button type="submit" className="btn-primary">Terapkan</button>
          <Link href="/atlet" className="btn-secondary">Reset</Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Tidak ada atlet pada filter ini.</p>
          <p className="empty-state-desc">Ubah filter/reset pencarian, atau tambahkan atlet baru.</p>
          <Link href="/atlet/tambah" className="btn-primary mt-2 text-sm">+ Tambah Atlet</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table !min-w-[760px]">
            <thead>
              <tr><th></th><th>Nama</th><th>Program</th><th>Cakra</th><th>KU</th><th>Kelompok</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filteredRows.map((a) => (
                <tr key={a.id}>
                  <td className="w-12 p-2">
                    {a.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photo_url} alt={`Foto ${a.full_name}`} className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" />
                    ) : (
                      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                        {(a.nickname || a.full_name).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/atlet/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.full_name}
                    </Link>
                    {a.nickname && <span className="ml-1 text-slate-400">({a.nickname})</span>}
                    <p className="text-xs text-slate-400">{a.gender === "M" ? "Putra" : a.gender === "F" ? "Putri" : ""}{a.join_date ? ` • masuk ${a.join_date.slice(0, 4)}` : ""}</p>
                  </td>
                  <td className="text-slate-600">{groupOf[a.id] || "—"}</td>
                  <td><span className="badge-info badge">{kuFromBirth(a.birth_date)}</span></td>
                  <td className="text-slate-600">{groupOf[a.id] || "—"}</td>
                  <td>
                    <span
                      className={`badge ${
                        a.status === "ACTIVE"
                          ? "badge-success"
                          : a.status === "INACTIVE"
                          ? "badge-warning"
                          : "badge-neutral"
                      }`}
                    >
                      {STATUS_LABELS[a.status as keyof typeof STATUS_LABELS] ?? a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Navigasi halaman" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Halaman {page} dari {totalPages} ({count} atlet)</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs({ page: String(page - 1) })} className="btn-secondary px-3 py-1.5">← Sebelumnya</Link>}
            {page < totalPages && <Link href={qs({ page: String(page + 1) })} className="btn-secondary px-3 py-1.5">Berikutnya →</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
