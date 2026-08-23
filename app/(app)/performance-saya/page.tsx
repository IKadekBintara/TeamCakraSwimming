import { getProfile } from "@/lib/page-guard";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** PERFORMANCE SAYA — hasil performa atlet sendiri via RLS perf_select_athlete_self. */
export default async function PerformanceSayaPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["athlete", "parent"].includes((profile.role as string) ?? "")) redirect("/performance");

  const supabase = createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name").limit(1).maybeSingle();

  const { data: results } = await supabase
    .from("athlete_performance_results")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(200);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Performance Saya</h1>
        <p className="text-sm text-slate-500">{athlete?.full_name ?? ""}</p>
      </div>

      {(results ?? []).length === 0 ? (
        <div className="card"><p className="text-sm text-slate-500">Belum ada catatan performa.</p></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Gaya</th>
                <th className="px-3 py-2">Jarak</th>
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(results ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.recorded_at?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-2">{r.stroke}</td>
                  <td className="px-3 py-2">{r.distance} m</td>
                  <td className="px-3 py-2 font-medium">{formatCs(r.time_cs)}</td>
                  <td className="px-3 py-2 text-slate-500">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCs(cs: number | null): string {
  if (!cs && cs !== 0) return "—";
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}
