import { getProfile } from "@/lib/page-guard";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_LABELS } from "@/types";

export const dynamic = "force-dynamic";

/** ABSENSI SAYA — riwayat kehadiran atlet sendiri via RLS. */
export default async function AbsensiSayaPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["athlete", "parent"].includes((profile.role as string) ?? "")) redirect("/absensi");

  const supabase = createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name").limit(1).maybeSingle();

  const { data: rows } = await supabase
    .from("attendance")
    .select("id, status, created_at, training_sessions(session_date, start_time)")
    .order("created_at", { ascending: false })
    .limit(100);

  const total = (rows ?? []).length;
  const present = (rows ?? []).filter((r) => r.status === "present").length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Absensi Saya</h1>
        <p className="text-sm text-slate-500">{athlete?.full_name ?? ""}</p>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Tingkat Kehadiran</h2>
          <span className="badge bg-brand-100 text-brand-800">{pct}% hadir</span>
        </div>
        <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        {(rows ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada riwayat absensi.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(rows ?? []).map((a) => {
              const s = a.training_sessions as { session_date?: string; start_time?: string } | null;
              return (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="text-slate-600">{s?.session_date ?? "—"}{s?.start_time ? ` · ${s.start_time}` : ""}</span>
                  <span className={`badge ${a.status === "present" ? "bg-emerald-100 text-emerald-700" : a.status === "absent" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    {ATTENDANCE_LABELS[a.status as keyof typeof ATTENDANCE_LABELS] ?? a.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
