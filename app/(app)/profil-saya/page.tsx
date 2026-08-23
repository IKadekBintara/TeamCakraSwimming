import { getProfile } from "@/lib/page-guard";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ATTENDANCE_LABELS } from "@/types";

export const dynamic = "force-dynamic";

/** PROFIL SAYA — atlet melihat data dirinya sendiri via RLS (athletes_self_select). */
export default async function ProfilSayaPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["athlete", "parent"].includes((profile.role as string) ?? "")) redirect("/atlet");

  const supabase = createClient();
  const { data: athlete } = await supabase
    .from("athletes")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!athlete) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 pt-14 lg:pt-0">
        <h1 className="text-2xl font-bold">Profil Saya</h1>
        <div className="card">
          <p className="text-sm text-slate-500">
            Belum ada data atlet yang tertaut dengan akun ini. Hubungi admin untuk menautkan data atlet Anda.
          </p>
        </div>
      </div>
    );
  }

  const { data: membership } = await supabase
    .from("training_group_members")
    .select("joined_at, training_groups(name, location)")
    .eq("athlete_id", athlete.id)
    .is("left_at", null)
    .maybeSingle();

  const group = membership?.training_groups as { name?: string; location?: string } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-14 lg:pt-0">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-2xl text-brand-700">
          {athlete.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={athlete.photo_url} alt={athlete.full_name} className="h-full w-full object-cover" />
          ) : (
            athlete.full_name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{athlete.full_name}</h1>
          <p className="text-sm text-slate-500">{athlete.program ?? "—"} • {group?.name ?? "Tanpa kelompok"}</p>
          <span className={`badge mt-1 ${athlete.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {athlete.status === "ACTIVE" ? "Atlet Aktif" : "Tidak Aktif"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-semibold">Data Diri</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Nama Panggilan" v={athlete.nickname} />
            <Row k="Sekolah" v={athlete.school} />
            <Row k="Kelas" v={athlete.grade} />
            <Row k="Tanggal Lahir" v={athlete.birth_date} />
            <Row k="Jenis Kelamin" v={athlete.gender === "M" ? "Laki-laki" : athlete.gender === "F" ? "Perempuan" : null} />
            <Row k="Bergabung" v={athlete.join_date} />
          </dl>
        </div>
        <div className="card space-y-2">
          <h2 className="font-semibold">Kelompok Latihan</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Cakra" v={athlete.cakra} />
            <Row k="Kelompok" v={group?.name ?? null} />
            <Row k="Lokasi" v={group?.location ?? null} />
            <Row k="Bergabung Kelompok" v={membership?.joined_at ?? null} />
          </dl>
        </div>
      </div>

      <RiwayatSingkat athleteId={athlete.id} />
    </div>
  );
}

async function RiwayatSingkat({ athleteId }: { athleteId: string }) {
  const supabase = createClient();
  const { data: attendance } = await supabase
    .from("attendance")
    .select("id, status, training_sessions(session_date)")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">Absensi Terakhir</h2>
      {(attendance ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada riwayat absensi.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {(attendance ?? []).map((a) => {
            const s = a.training_sessions as { session_date?: string } | null;
            return (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span className="text-slate-600">{s?.session_date ?? "—"}</span>
                <span className="badge bg-brand-50 text-brand-700">{ATTENDANCE_LABELS[a.status as keyof typeof ATTENDANCE_LABELS] ?? a.status}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v || "—"}</dd>
    </div>
  );
}
