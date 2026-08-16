import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { STATUS_LABELS } from "@/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "ACTIVE", label: "Aktif" },
  { key: "INACTIVE", label: "Nonaktif" },
  { key: "LEFT_CLUB", label: "Keluar" },
  { key: "ALL", label: "Semua" },
];

export default async function AtletPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const supabase = createClient();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "ACTIVE";

  let query = supabase
    .from("athletes")
    .select("id, full_name, nickname, program, status, whatsapp, join_date, left_at")
    .order("full_name");

  if (q) query = query.ilike("full_name", `%${q}%`);
  if (status !== "ALL") query = query.eq("status", status);

  const { data: athletes } = await query;

  // Kelompok aktif per atlet
  const ids = (athletes ?? []).map((a) => a.id);
  const { data: memberships } = ids.length
    ? await supabase
        .from("training_group_members")
        .select("athlete_id, training_groups(name)")
        .in("athlete_id", ids)
        .is("left_at", null)
    : { data: [] as never[] };

  const groupOf: Record<string, string> = {};
  for (const m of memberships ?? []) {
    groupOf[m.athlete_id] = (m.training_groups as { name?: string } | null)?.name ?? "";
  }

  const counts = {
    ACTIVE: 0, INACTIVE: 0, LEFT_CLUB: 0,
  };
  {
    const { data } = await supabase.from("athletes").select("status");
    for (const a of data ?? []) counts[a.status as keyof typeof counts]++;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Atlet</h1>
          <p className="text-sm text-slate-500">Semua atlet Team Cakra Swimming</p>
        </div>
        <Link href="/atlet/tambah" className="btn-primary shrink-0">
          + Tambah Atlet
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/atlet?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f.key
                ? "bg-brand-600 text-white"
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

      <form className="flex gap-2" method="get">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari nama atlet..."
          className="input"
        />
        <button className="btn-secondary" type="submit">Cari</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Kelompok</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(athletes ?? []).map((a) => (
              <tr key={a.id} className="hover:bg-brand-50/50">
                <td className="px-4 py-3">
                  <Link href={`/atlet/${a.id}`} className="font-medium text-brand-700 hover:underline">
                    {a.full_name}
                  </Link>
                  {a.nickname && <span className="ml-1 text-slate-400">({a.nickname})</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{a.program ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{groupOf[a.id] || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      a.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : a.status === "INACTIVE"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {STATUS_LABELS[a.status as keyof typeof STATUS_LABELS] ?? a.status}
                  </span>
                </td>
              </tr>
            ))}
            {(athletes ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Tidak ada atlet pada filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
