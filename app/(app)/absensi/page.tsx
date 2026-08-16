import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AbsensiPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: groups } = await supabase
    .from("training_groups")
    .select("id, name, location, is_active")
    .eq("is_active", true)
    .order("name");

  const { data: recentSessions } = await supabase
    .from("training_sessions")
    .select("id, session_date, group_id, training_groups(name)")
    .order("session_date", { ascending: false })
    .limit(14);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Absensi</h1>
        <p className="text-sm text-slate-500">Pilih kelompok untuk mulai mencatat kehadiran</p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Kelompok Latihan</h2>
        <ul className="divide-y divide-slate-100">
          {(groups ?? []).map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-slate-800">{g.name}</p>
                {g.location && <p className="text-sm text-slate-500">{g.location}</p>}
              </div>
              <Link href={`/absensi/${g.id}?date=${today}`} className="btn-primary shrink-0 text-sm">
                Buka
              </Link>
            </li>
          ))}
          {(groups ?? []).length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              Belum ada kelompok aktif.
            </li>
          )}
        </ul>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Sesi Terakhir</h2>
        {(recentSessions ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada sesi tercatat.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(recentSessions ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="text-slate-700">
                  {(s.training_groups as { name?: string } | null)?.name ?? "—"}
                </span>
                <Link
                  href={`/absensi/${s.group_id}?date=${s.session_date}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {s.session_date}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
