import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import { ATTENDANCE_LABELS, DAY_NAMES, STATUS_LABELS } from "@/types";
import { calculateDolphinKu } from "@/lib/events";
import { normalizeCakra } from "@/lib/cakra";
import { rateLimit } from "@/lib/rate-limit";

/** Filename ASCII-safe untuk HTTP header (ByteString) — Unicode tetap aman. */
function asciiFilename(base: string): string {
  const cleaned = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .\-_()]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned.slice(0, 120) : "export.xlsx";
}

const STAFF_ROLES = new Set(["admin", "operator", "coach", "group_leader", "ketua_kelompok"]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  let stage = "request";
  const log = (message: string, details: Record<string, unknown> = {}) => {
    console.info(`EXPORT_DEBUG ${requestId} ${message}`, details);
  };

  try {
  const rl = rateLimit(req, "export", 12);
  if (rl) return rl;
  stage = "auth";
  log("stage=auth");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  log("stage=auth.complete", { authenticated: Boolean(user), user_id: user?.id ?? null });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "x-request-id": requestId } });

  stage = "authorization";
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  log("stage=authorization.complete", { role: profile?.role ?? null, profile_query_error: profileError?.message ?? null });

  const kind = req.nextUrl.searchParams.get("kind") ?? "athletes";
  const from = req.nextUrl.searchParams.get("from") ?? "2000-01-01";
  const to = req.nextUrl.searchParams.get("to") ?? "2100-01-01";
  const eventId = req.nextUrl.searchParams.get("event_id");
  log("stage=request.parsed", { kind, from, to, event_id: eventId });

  // Export berisi data organisasi — hanya staff yang boleh mengunduh.
  if (!STAFF_ROLES.has(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": requestId } });
  }

  // Validasi event_id untuk export berbasis event (400 invalid, 404 tidak ditemukan).
  let pickedEvent: { id: string; name: string } | null = null;
  if (kind === "event_registrations" || kind === "event_finance") {
    if (!eventId) {
      return NextResponse.json({ error: "event_id wajib diisi" }, { status: 400, headers: { "x-request-id": requestId } });
    }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(eventId)) {
      return NextResponse.json({ error: "event_id tidak valid" }, { status: 400, headers: { "x-request-id": requestId } });
    }
    stage = "query.event";
    const { data: evRow } = await supabase.from("events").select("id, name").eq("id", eventId).maybeSingle();
    if (!evRow) {
      return NextResponse.json({ error: "Event tidak ditemukan" }, { status: 404, headers: { "x-request-id": requestId } });
    }
    pickedEvent = evRow;
  }
  const eventName = pickedEvent?.name ?? "";

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(from) || !datePattern.test(to) || from > to) {
    log("stage=request.validation", { error: "Invalid export date range" });
    return NextResponse.json({ error: "Invalid export date range" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const wb = XLSX.utils.book_new();
  let filename = "export.xlsx";

  if (kind === "athletes" || kind === "athletes_active" || kind === "athletes_left") {
    stage = "query.athletes";
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
      "Nama Lengkap": String(a.full_name ?? "").toUpperCase(),
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
    stage = "query.attendance";
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
    stage = "query.groups";
    // leader_id has no FK to profiles; embedded lookup would fail the whole
    // query, so resolve leader names via a separate profiles fetch.
    const { data: groupRows, error: groupsErr } = await supabase
      .from("training_groups")
      .select("id, name, location, is_active, coach_id, leader_id, coaches(full_name)")
      .order("name");
    if (groupsErr) throw new Error(`query.groups: ${groupsErr.message}`);
    const leaderIds = Array.from(
      new Set((groupRows ?? []).map((g) => g.leader_id).filter((v): v is string => Boolean(v)))
    );
    const { data: leaderProfiles } =
      leaderIds.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", leaderIds)
        : { data: [] as { id: string; full_name: string }[] };
    const leaderNameById = new Map((leaderProfiles ?? []).map((p) => [p.id, p.full_name]));
    const rows = (groupRows ?? []).map((g) => ({
      "Nama Kelompok": g.name,
      "Lokasi": g.location,
      "Pelatih": (g.coaches as { full_name?: string } | null)?.full_name ?? "",
      "Ketua": (g.leader_id ? leaderNameById.get(g.leader_id) : null) ?? "",
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
  } else if (kind === "event_registrations") {
    stage = "query.registrations";
    log("stage=query.registrations.start");
    const toExclusive = new Date(`${to}T00:00:00Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const { data: registrations, error: registrationsError } = await supabase
      .from("event_registrations")
      .select("id, event_id, athlete_id, ku, ku_override, status, created_at, athletes(full_name, gender, birth_date, cakra), events(name, event_date), event_registration_entries(race_id, price_snapshot)")
      .eq("event_id", eventId!)
      .gte("created_at", `${from}T00:00:00Z`)
      .lt("created_at", toExclusive.toISOString())
      .order("created_at");
    if (registrationsError) {
      console.error(`EXPORT_DEBUG ${requestId} stage=query.registrations`, { error_name: registrationsError.name, error_message: registrationsError.message, error_code: registrationsError.code, details: registrationsError.details, hint: registrationsError.hint });
      return NextResponse.json({ error: "Failed to export event registrations", request_id: requestId }, { status: 500, headers: { "x-request-id": requestId } });
    }
    log("stage=query.registrations.complete", { row_count: registrations?.length ?? 0 });

    const registrationIds = (registrations ?? []).map((r) => r.id);
    stage = "query.payments";
    const { data: payments, error: paymentsError } = registrationIds.length
      ? await supabase
          .from("event_payments")
          .select("registration_id, registration_fee, admin_fee, total_amount, payment_status")
          .in("registration_id", registrationIds)
      : { data: [], error: null };
    if (paymentsError) {
      console.error(`EXPORT_DEBUG ${requestId} stage=query.payments`, { error_name: paymentsError.name, error_message: paymentsError.message, error_code: paymentsError.code, details: paymentsError.details, hint: paymentsError.hint });
      return NextResponse.json({ error: "Failed to export event registrations", request_id: requestId }, { status: 500, headers: { "x-request-id": requestId } });
    }
    log("stage=query.payments.complete", { row_count: payments?.length ?? 0 });

    const raceIds = (registrations ?? []).flatMap((r) =>
      (Array.isArray(r.event_registration_entries) ? r.event_registration_entries : []).map((entry) => entry.race_id)
    );
    stage = "query.races";
    const { data: races, error: racesError } = raceIds.length
      ? await supabase.from("event_races").select("id, name").in("id", raceIds)
      : { data: [], error: null };
    if (racesError) {
      console.error(`EXPORT_DEBUG ${requestId} stage=query.races`, { error_name: racesError.name, error_message: racesError.message, error_code: racesError.code, details: racesError.details, hint: racesError.hint });
      return NextResponse.json({ error: "Failed to export event registrations", request_id: requestId }, { status: 500, headers: { "x-request-id": requestId } });
    }
    log("stage=query.races.complete", { row_count: races?.length ?? 0 });

    stage = "mapping";
    const paymentByRegistration = new Map((payments ?? []).map((payment) => [payment.registration_id, payment]));
    const raceById = new Map((races ?? []).map((race) => [race.id, race.name]));
    const rows = (registrations ?? []).map((registration) => {
      const athlete = Array.isArray(registration.athletes) ? registration.athletes[0] : registration.athletes;
      const event = Array.isArray(registration.events) ? registration.events[0] : registration.events;
      const payment = paymentByRegistration.get(registration.id);
      const entries = Array.isArray(registration.event_registration_entries) ? registration.event_registration_entries : [];
      return {
        "ID Pendaftaran": registration.id,
        "ID Atlet": registration.athlete_id,
        "Nama": athlete?.full_name ?? "",
        "PA/PI": athlete?.gender ?? "",
        "Tanggal Lahir": athlete?.birth_date ?? "",
        "Tahun Lahir": athlete?.birth_date ? String(athlete.birth_date).slice(0, 4) : "",
        "KU": registration.ku_override || registration.ku || "",
        "Cakra": athlete?.cakra ?? "",
        "Event": event?.name ?? "",
        "Tanggal Event": event?.event_date ?? "",
        "Nomor Lomba": entries.map((entry) => raceById.get(entry.race_id) ?? "").filter(Boolean).join(", "),
        "Harga Nomor": entries.reduce((sum, entry) => sum + Number(entry.price_snapshot || 0), 0),
        "Admin": Number(payment?.admin_fee || 0),
        "Total": Number(payment?.total_amount || 0),
        "Status Pendaftaran": registration.status || "",
        "Status Pembayaran": payment?.payment_status || "BELUM_BAYAR",
        "Tanggal Pendaftaran": registration.created_at || "",
      };
    });
    log("stage=mapping.complete", { row_count: rows.length });
    if (rows.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["ID Pendaftaran", "ID Atlet", "Nama", "PA/PI", "Tanggal Lahir", "Tahun Lahir", "KU", "Cakra", "Event", "Tanggal Event", "Nomor Lomba", "Harga Nomor", "Admin", "Total", "Status Pendaftaran", "Status Pembayaran", "Tanggal Pendaftaran"],
      ]), "Pendaftaran");
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Pendaftaran");
    }
    filename = asciiFilename(`TEAM CAKRA - DATA PENDAFTARAN - ${eventName || "SEMUA EVENT"}`);
  } else if (kind === "event_finance") {
    stage = "query.finance";
    const { data: payments, error } = await supabase
      .from("event_payments")
      .select("id, transaction_id, athlete_id, athlete_name, cakra, jumlah_nomor, registration_fee, admin_fee, total_amount, amount_paid, remaining_amount, payment_status, payment_method, payment_destination, submitted_at, verified_at, notes, events(name, event_date), event_registrations(ku, ku_override, event_registration_entries(event_races(name)), athletes(full_name, gender, birth_date))")
      .eq("event_id", eventId!)
      .order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (payments ?? []).map((p) => ({
      "ID Transaksi": p.transaction_id,
      "ID Atlet": p.athlete_id,
      "Nama": p.athlete_name,
      "Cakra": normalizeCakra(p.cakra, []),
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
    if (rows.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["ID Transaksi", "ID Atlet", "Nama", "Cakra", "Event", "Jumlah Nomor", "Uang Pendaftaran", "Admin", "Total Tagihan", "Sudah Dibayar", "Sisa", "Status Pembayaran", "Metode Pembayaran", "Tujuan Pembayaran", "Tanggal Bayar", "Verified At", "Catatan"],
      ]), "Keuangan");
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Keuangan");
    }
    filename = asciiFilename(`TEAM CAKRA - KEUANGAN - ${eventName || "SEMUA EVENT"}`);
  } else if (kind === "performance") {
    stage = "query.performance";
    const { data: perf, error: perfError } = await supabase
      .from("athlete_performance_results")
      .select("id, athlete_id, recorded_at, stroke, distance, time_cs, pool_length, meet_name, rank, athletes(full_name, cakra, birth_date), events(name)")
      .order("recorded_at", { ascending: false });
    if (perfError) {
      console.error(`EXPORT_DEBUG ${requestId} stage=query.performance`, { error_name: perfError.name, error_message: perfError.message });
      return NextResponse.json({ error: "Failed to export performance", request_id: requestId }, { status: 500, headers: { "x-request-id": requestId } });
    }
    // PB per atlet + kombinasi stroke+distance (semakin kecil = lebih baik)
    const pbMap = new Map<string, number>();
    for (const r of perf ?? []) {
      if (r.time_cs == null) continue;
      const key = `${r.athlete_id}|${r.stroke}|${r.distance}`;
      if (!pbMap.has(key) || (pbMap.get(key) as number) > r.time_cs) pbMap.set(key, r.time_cs);
    }
    const perfRows = (perf ?? []).map((r) => {
      const a = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
      const ev = Array.isArray(r.events) ? r.events[0] : r.events;
      const pb = r.time_cs != null ? pbMap.get(`${r.athlete_id}|${r.stroke}|${r.distance}`) : undefined;
      const fmt = (cs?: number | null) => {
        if (cs == null) return "DNF/DQ";
        const m = Math.floor(cs / 6000); const s = Math.floor((cs % 6000) / 100); const c = cs % 100;
        return m > 0 ? `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}` : `${s}.${String(c).padStart(2, "0")}`;
      };
      return {
        "Atlet": a?.full_name ?? "",
        "Cakra": a?.cakra ?? "",
        "KU": a?.birth_date ? calculateDolphinKu(a.birth_date) : "",
        "Stroke": r.stroke,
        "Distance": `${r.distance}m`,
        "Waktu": fmt(r.time_cs),
        "PB": pb != null ? fmt(pb) : "",
        "Tanggal": r.recorded_at,
        "Kolam": r.pool_length ? `${r.pool_length}m` : "",
        "Event": ev?.name ?? r.meet_name ?? "",
        "Rank": r.rank ?? "",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perfRows), "Performance");
    filename = "TEAM CAKRA - PERFORMANCE ATLET.xlsx";
  } else {
    log("stage=request.validation", { error: "Unknown export kind" });
    return NextResponse.json({ error: "Unknown export kind" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  stage = "excel";
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  log("stage=excel.complete", { bytes: buf.length, filename });
  stage = "response";
  const response = new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "x-request-id": requestId,
    },
  });
  log("stage=response.complete", { status: 200 });
  return response;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`EXPORT_DEBUG ${requestId} stage=${stage}`, { error_name: err.name, error_message: err.message, stack: err.stack });
    return NextResponse.json({ error: "Export failed", request_id: requestId }, { status: 500, headers: { "x-request-id": requestId } });
  }
}
