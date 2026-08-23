import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ATTENDANCE_LABELS, STATUS_LABELS, waLink, mapsLink } from "@/types";
import AthleteStatusActions from "@/components/AthleteStatusActions";
import AthleteAccountPanel from "@/components/AthleteAccountPanel";
import AthletePerformance from "@/components/AthletePerformance";
import PerformanceResultForm from "@/components/PerformanceResultForm";
import type { PerfResult } from "@/lib/performance";

export const dynamic = "force-dynamic";

export default async function AtletDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: athlete } = await supabase
    .from("athletes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!athlete) notFound();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
  const role = profile?.role ?? "parent";
  const canManagePerf = role === "admin" || role === "operator" || role === "coach" || role === "group_leader" || role === "ketua_kelompok";

  // Ownership validation: atlet/parent hanya boleh membuka profilnya sendiri.
  // (Staff bebas; atlet lain sudah tersaring RLS, ini lapisan halaman.)
  if (!canManagePerf && role !== "parent") {
    const mine = await supabase.from("athletes").select("id").limit(1).maybeSingle();
    if (mine.data?.id !== athlete.id) notFound();
  }

  const [{ data: membership }, { data: attendance }, { data: history }, { data: eventRegs }, { data: perfRows }, { data: perfEvents }] = await Promise.all([
    supabase
      .from("training_group_members")
      .select("group_id, joined_at, training_groups(name, location)")
      .eq("athlete_id", params.id)
      .is("left_at", null)
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("id, status, created_at, training_sessions(session_date)")
      .eq("athlete_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("training_group_members")
      .select("joined_at, left_at, training_groups(name)")
      .eq("athlete_id", params.id)
      .order("joined_at", { ascending: false }),
    supabase
      .from("event_registrations")
      .select("id, ku, ku_override, status, events(name,event_date), event_registration_entries(event_races(name)), event_payments(payment_status,total_amount,amount_paid,remaining_amount)")
      .eq("athlete_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("athlete_performance_results")
      .select("*")
      .eq("athlete_id", params.id)
      .order("recorded_at", { ascending: false })
      .limit(100),
    canManagePerf
      ? supabase.from("events").select("id, name").order("event_date", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const total = attendance?.length ?? 0;
  const presentCount = (attendance ?? []).filter((a) => a.status === "present").length;
  const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  const group = membership?.training_groups as { name?: string; location?: string } | null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pt-14 lg:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
            <p className="text-sm text-slate-500">
              {athlete.nickname ? `"${athlete.nickname}" • ` : ""}
              {athlete.program ?? "—"} • {group?.name ?? "Tanpa kelompok"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span
                className={`badge ${
                  athlete.status === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-700"
                    : athlete.status === "INACTIVE"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {STATUS_LABELS[athlete.status as keyof typeof STATUS_LABELS] ?? athlete.status}
              </span>
              {athlete.status === "LEFT_CLUB" && athlete.left_at && (
                <span className="badge bg-red-50 text-red-700">
                  Keluar {athlete.left_at}{athlete.left_reason ? ` — ${athlete.left_reason}` : ""}
                </span>
              )}
              {athlete.reactivated_at && (
                <span className="badge bg-sky-50 text-sky-700">
                  Reaktivasi {athlete.reactivated_at}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AthleteStatusActions athleteId={athlete.id} status={athlete.status} />
          <Link href={`/atlet/${athlete.id}/edit`} className="btn-secondary text-sm">
            Edit
          </Link>
        </div>
      </div>

      {(athlete.status === "LEFT_CLUB" || athlete.status === "INACTIVE") && (
        <div className="card border-amber-300 bg-amber-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-amber-900">⚠ ATLET SUDAH KELUAR</h2>
              <p className="mt-0.5 text-sm text-amber-800">
                Tanggal keluar: {athlete.left_at ?? "—"}
                {athlete.left_reason ? ` · Alasan: ${athlete.left_reason}` : ""}
              </p>
              <p className="text-xs text-amber-700">
                Akun login dinonaktifkan dan sesi dicabut. Seluruh data historis di bawah tetap tersimpan dan dapat dibuka.
              </p>
            </div>
            <AthleteStatusActions athleteId={athlete.id} status={athlete.status} />
          </div>
        </div>
      )}

      {role === "admin" && <AthleteAccountPanel athleteId={athlete.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <h2 className="font-semibold">Data Diri</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Sekolah" v={athlete.school} />
            <Row k="Kelas" v={athlete.grade} />
            <Row k="Tanggal Lahir" v={athlete.birth_date} />
            <Row k="Jenis Kelamin" v={athlete.gender === "M" ? "Laki-laki" : athlete.gender === "F" ? "Perempuan" : null} />
            <Row k="Bergabung" v={athlete.join_date} />
          </dl>
        </div>

        <div className="card space-y-2">
          <h2 className="font-semibold">Kontak Orang Tua</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Nama" v={athlete.parent_name} />
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">WhatsApp</dt>
              <dd>
                {athlete.whatsapp ? (
                  <a href={waLink(athlete.whatsapp)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                    {athlete.whatsapp} ↗
                  </a>
                ) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Alamat</dt>
              <dd className="text-right">
                {athlete.address ? (
                  <a href={mapsLink(athlete.address)} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                    {athlete.address} ↗
                  </a>
                ) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Kehadiran</h2>
          <span className="badge bg-brand-100 text-brand-800">{pct}% hadir</span>
        </div>
        <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
        {(attendance ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada riwayat absensi.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(attendance ?? []).map((a) => {
              const s = a.training_sessions as { session_date?: string } | null;
              return (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="text-slate-600">{s?.session_date ?? "—"}</span>
                  <StatusBadge status={a.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Event & Pembayaran</h2>
        {(eventRegs ?? []).length === 0 ? <p className="text-sm text-slate-500">Belum pernah mengikuti event.</p> : <ul className="divide-y divide-slate-100 text-sm">{(eventRegs ?? []).map((r) => { const event = r.events as { name?: string; event_date?: string } | null; const payment = Array.isArray(r.event_payments) ? r.event_payments[0] : r.event_payments; const races = (r.event_registration_entries ?? []).map((e) => (e.event_races as { name?: string } | null)?.name).filter(Boolean).join(", "); return <li key={r.id} className="space-y-1 py-3"><div className="flex justify-between gap-3"><span className="font-medium">{event?.name ?? "Event"}</span><span className="badge bg-slate-100 text-slate-700">{payment?.payment_status ?? "—"}</span></div><p className="text-xs text-slate-500">{event?.event_date ?? "—"} · {r.ku_override || r.ku} · {races || "Nomor belum tercatat"}</p><p className="text-xs text-slate-600">Tagihan {payment ? `Rp${Number(payment.total_amount || 0).toLocaleString("id-ID")} · Dibayar Rp${Number(payment.amount_paid || 0).toLocaleString("id-ID")} · Sisa Rp${Number(payment.remaining_amount || 0).toLocaleString("id-ID")}` : "—"}</p></li>; })}</ul>}
      </div>

      {canManagePerf && (
        <PerformanceResultForm
          athletes={[{ id: athlete.id, full_name: athlete.full_name }]}
          events={((perfEvents ?? []) as { id: string; name: string }[])}
        />
      )}

      <AthletePerformance results={(perfRows ?? []) as unknown as PerfResult[]} attendanceRate={pct} />

      <div className="card">
        <h2 className="mb-3 font-semibold">Riwayat Kelompok</h2>
        {(history ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Belum pernah tergabung dalam kelompok.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(history ?? []).map((h, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="font-medium text-slate-700">
                  {(h.training_groups as { name?: string } | null)?.name ?? "—"}
                </span>
                <span className="text-xs text-slate-500">
                  {h.joined_at} → {h.left_at ?? "sekarang"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
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

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-700",
    excused: "bg-amber-100 text-amber-700",
    sick: "bg-sky-100 text-sky-700",
    absent: "bg-red-100 text-red-700",
  };
  return (
    <span className={`badge ${cls[status] ?? "bg-slate-100 text-slate-600"}`}>
      {ATTENDANCE_LABELS[status as keyof typeof ATTENDANCE_LABELS] ?? status}
    </span>
  );
}
