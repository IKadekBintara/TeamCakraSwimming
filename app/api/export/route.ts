import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import { ATTENDANCE_LABELS, DAY_NAMES, STATUS_LABELS } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kind = req.nextUrl.searchParams.get("kind") ?? "athletes";
  const from = req.nextUrl.searchParams.get("from") ?? "2000-01-01";
  const to = req.nextUrl.searchParams.get("to") ?? "2100-01-01";

  const wb = XLSX.utils.book_new();
  let filename = "export.xlsx";

  if (kind === "athletes" || kind === "athletes_active" || kind === "athletes_left") {
    let query = supabase
      .from("athletes")
      .select("full_name, nickname, birth_date, gender, school, grade, parent_name, whatsapp, address, program, cakra, status, join_date, left_at, left_reason")
      .order("full_name");
    if (kind === "athletes_active") query = query.eq("status", "ACTIVE");
    if (kind === "athletes_left") query = query.eq("status", "LEFT_CLUB");

    const { data } = await query;
    const ids = (data ?? []).map((a) => a.full_name); // group lookup via members below
    void ids;
    const { data: members } = await supabase
      .from("training_group_members")
      .select("athlete_id, athletes(full_name), training_groups(name)")
      .is("left_at", null);

    const groupOf = new Map<string, string>();
    for (const m of members ?? []) {
      const fn = (m.athletes as { full_name?: string } | null)?.full_name;
      if (fn) groupOf.set(fn, (m.training_groups as { name?: string } | null)?.name ?? "");
    }

    const rows = (data ?? []).map((a) => ({
      "Nama Lengkap": a.full_name,
      "Panggilan": a.nickname,
      "Tanggal Lahir": a.birth_date,
      "JK": a.gender,
      "Sekolah": a.school,
      "Kelas": a.grade,
      "Orang Tua": a.parent_name,
      "WhatsApp": a.whatsapp,
      "Alamat": a.address,
      "Program": a.program,
      "Cakra": a.cakra,
      "Kelompok": groupOf.get(a.full_name) ?? "",
      "Status": STATUS_LABELS[a.status as keyof typeof STATUS_LABELS] ?? a.status,
      "Tanggal Bergabung": a.join_date,
      "Tanggal Keluar": a.left_at,
      "Alasan Keluar": a.left_reason,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Atlet");
    filename = `atlet-${kind === "athletes" ? "semua" : kind === "athletes_active" ? "aktif" : "keluar"}-team-cakra.xlsx`;
  } else if (kind === "attendance") {
    const { data: sessions } = await supabase
      .from("training_sessions")
      .select("id, session_date, training_groups(name)")
      .gte("session_date", from)
      .lte("session_date", to)
      .order("session_date");
    const sessIds = (sessions ?? []).map((s) => s.id);
    const { data: att } = sessIds.length
      ? await supabase
          .from("attendance")
          .select("session_id, status, athletes(full_name)")
          .in("session_id", sessIds)
      : { data: [] as never[] };

    const sessMap = new Map((sessions ?? []).map((s) => [s.id, s]));
    const rows = (att ?? []).map((a) => {
      const s = sessMap.get(a.session_id) as
        | { session_date?: string; training_groups?: { name?: string } | null }
        | undefined;
      return {
        "Tanggal": s?.session_date ?? "",
        "Kelompok": s?.training_groups?.name ?? "",
        "Atlet": (a.athletes as { full_name?: string } | null)?.full_name ?? "",
        "Status": ATTENDANCE_LABELS[a.status as keyof typeof ATTENDANCE_LABELS] ?? a.status,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Absensi");
    filename = `absensi-${from}_${to}.xlsx`;
  } else if (kind === "groups") {
    const { data } = await supabase
      .from("training_groups")
      .select("name, location, is_active, coaches(full_name), leader:leader_id(full_name)")
      .order("name");
    const rows = (data ?? []).map((g) => ({
      "Nama Kelompok": g.name,
      "Lokasi": g.location,
      "Pelatih": (g.coaches as { full_name?: string } | null)?.full_name ?? "",
      "Ketua": (g.leader as { full_name?: string } | null)?.full_name ?? "",
      "Aktif": g.is_active ? "Ya" : "Tidak",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Kelompok");

    const { data: sched } = await supabase
      .from("training_schedules")
      .select("day_of_week, start_time, end_time, location, is_active, training_groups(name)")
      .order("day_of_week");
    const srows = (sched ?? []).map((s) => ({
      "Kelompok": (s.training_groups as { name?: string } | null)?.name ?? "",
      "Hari": DAY_NAMES[s.day_of_week] ?? s.day_of_week,
      "Mulai": String(s.start_time).slice(0, 5),
      "Selesai": String(s.end_time).slice(0, 5),
      "Lokasi": s.location,
      "Aktif": s.is_active ? "Ya" : "Tidak",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(srows), "Jadwal");
    filename = `kelompok-jadwal-team-cakra.xlsx`;
  } else if (kind === "event_registrations" || kind === "event_finance") {
    const { data: payments, error } = await supabase
      .from("event_payments")
      .select("id, transaction_id, athlete_id, athlete_name, cakra, jumlah_nomor, registration_fee, admin_fee, total_amount, amount_paid, remaining_amount, payment_status, payment_method, payment_destination, submitted_at, verified_at, notes, events(name, event_date), event_registrations(ku, ku_override, event_registration_entries(event_races(name)), athletes(full_name, gender, birth_date))")
      .order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (kind === "event_registrations") {
      const rows = (payments ?? []).map((p) => {
        const reg = p.event_registrations as { ku?: string; ku_override?: string | null; event_registration_entries?: Array<{ event_races?: { name?: string } | null }>; athletes?: { full_name?: string; gender?: string | null; birth_date?: string | null } | null } | null;
        return {
          "ID": p.athlete_id,
          "Nama": p.athlete_name,
          "PA/PI": reg?.athletes?.gender ?? "",
          "Tanggal Lahir": reg?.athletes?.birth_date ?? "",
          "Tahun Lahir": reg?.athletes?.birth_date ? String(reg.athletes.birth_date).slice(0, 4) : "",
          "KU": reg?.ku_override || reg?.ku || "",
          "Cakra": p.cakra ?? "",
          "Event": (p.events as { name?: string } | null)?.name ?? "",
          "Nomor Lomba": (reg?.event_registration_entries ?? []).map((e) => e.event_races?.name).filter(Boolean).join(", "),
          "Jumlah Nomor": p.jumlah_nomor,
          "Status Pendaftaran": "REGISTERED",
          "Catatan": p.notes ?? "",
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Pendaftaran");
      filename = "TEAM CAKRA — DATA PENDAFTARAN DOLPHIN.xlsx";
    } else {
      const rows = (payments ?? []).map((p) => ({
        "ID Transaksi": p.transaction_id,
        "ID Atlet": p.athlete_id,
        "Nama": p.athlete_name,
        "Cakra": p.cakra ?? "",
        "Event": (p.events as { name?: string } | null)?.name ?? "",
        "Jumlah Nomor": p.jumlah_nomor,
        "Uang Pendaftaran": p.registration_fee,
        "Admin": p.admin_fee,
        "Total Tagihan": p.total_amount,
        "Sudah Dibayar": p.amount_paid,
        "Sisa": p.remaining_amount,
        "Status Pembayaran": p.payment_status,
        "Metode Pembayaran": p.payment_method ?? "",
        "Tujuan Pembayaran": p.payment_destination ?? "",
        "Tanggal Bayar": p.submitted_at ?? "",
        "Verified At": p.verified_at ?? "",
        "Catatan": p.notes ?? "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Keuangan");
      filename = "TEAM CAKRA — KEUANGAN DOLPHIN.xlsx";
    }
  } else {
    return NextResponse.json({ error: "Unknown export kind" }, { status: 400 });
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
