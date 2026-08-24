import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PERMANENT EVENT DELETE — hard delete atomik via rpc_permanent_delete_event.
 * - Hanya admin ACTIVE (validasi server-side, bukan sekadar hide tombol).
 * - GET: ringkasan dampak (jumlah race/registration/entry/payment).
 * - POST: hapus permanen + audit + enqueue Excel cleanup per config aktif.
 */
async function adminCtx() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: profile } = await client.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") return { error: 403 as const };
  return { user, service: createServiceClient() };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminCtx();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error === 401 ? "Sesi login diperlukan" : "Admin only" }, { status: ctx.error });
  const { id } = await params;
  const db = ctx.service;
  const { data: event } = await db.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event tidak ditemukan" }, { status: 404 });
  const [racesC, regsC] = await Promise.all([
    db.from("event_races").select("id", { count: "exact", head: true }).eq("event_id", id),
    db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", id),
  ]);
  return NextResponse.json({ id, name: event.name, races: racesC.count ?? 0, registrations: regsC.count ?? 0 });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminCtx();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error === 401 ? "Sesi login diperlukan" : "Hanya admin yang dapat menghapus event" }, { status: ctx.error });
  const user = ctx.user;

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "event_id tidak valid" }, { status: 400 });
  }

  const db = ctx.service;

  // Snapshot untuk konfirmasi & audit sebelum hapus.
  const { data: event } = await db.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event tidak ditemukan" }, { status: 404 });

  const [racesC, regsC] = await Promise.all([
    db.from("event_races").select("id", { count: "exact", head: true }).eq("event_id", id),
    db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", id),
  ]);
  const counts = { races: racesC.count ?? 0, registrations: regsC.count ?? 0 };

  // Daftar registration utk cleanup Excel (sebelum rows dihapus).
  const { data: regRows } = await db.from("event_registrations").select("id").eq("event_id", id);
  // Config sync AKTIF milik event ini + mapping stabil per registrasi.
  const { data: activeCfgs } = await db.from("excel_sync_configurations")
    .select("id, enabled, file_path, worksheet_name, header_row, first_data_row, max_row, mapping")
    .eq("event_id", id);
  const cfgIds = (activeCfgs ?? []).map((c) => c.id);
  const { data: maps } = cfgIds.length
    ? await db.from("excel_sync_row_mappings").select("configuration_id, registration_id, excel_row, athlete_key").in("configuration_id", cfgIds)
    : { data: [] };
  const mapByReg = new Map<string, { excel_row: number; athlete_key: string | null }>();
  for (const m of maps ?? []) mapByReg.set(`${m.configuration_id}:${m.registration_id}`, m);

  // 0) SELF-CONTAINED CLEANUP JOBS — WAJIB sebelum RPC delete:
  //    configuration ikut CASCADE saat event terhapus, tapi jobs TIDAK
  //    (registration_id tanpa FK). Instruksi lengkap disimpan di payload
  //    sehingga worker tetap bisa membersihkan baris tanpa induknya.
  let cleanupQueued = 0;
  for (const cfg of activeCfgs ?? []) {
    if (!cfg.enabled) continue;
    for (const r of regRows ?? []) {
      const m = mapByReg.get(`${cfg.id}:${r.id}`);
      const { error } = await db.from("excel_sync_jobs").insert({
        // Sengaja ORPHAN: configuration ikut CASCADE saat event terhapus,
        // jadi snapshot TIDAK boleh bergantung pada baris config mana pun.
        configuration_id: null,
        registration_id: r.id,
        action: "delete_registration",
        payload: {
          reason: "EVENT_PERMANENT_DELETED",
          snapshot: {
            file_path: cfg.file_path,
            worksheet_name: cfg.worksheet_name,
            header_row: cfg.header_row,
            first_data_row: cfg.first_data_row,
            max_row: cfg.max_row,
            mapping: cfg.mapping,
            excel_row: m?.excel_row ?? null,
            athlete_key: m?.athlete_key ?? null,
          },
        },
      });
      if (!error) cleanupQueued++;
    }
  }

  // 1) Atomic hard delete — gagal = rollback penuh.
  const { data: delResult, error: delError } = await db.rpc("rpc_permanent_delete_event", { p_event_id: id });
  if (delError) return NextResponse.json({ error: `Gagal menghapus: ${delError.message}` }, { status: 500 });

  // 2) Verifikasi DB benar-benar bersih.
  const verifyEvent = await db.from("events").select("id").eq("id", id).maybeSingle();
  if (verifyEvent.data) {
    return NextResponse.json({ error: "Verifikasi pasca-hapus gagal — event masih ada" }, { status: 500 });
  }

  // 3) Audit log (entity_id bebas FK → tetap bertahan setelah event hilang).
  await db.from("audit_logs").insert({
    actor_id: user.id,
    action: "DELETE_EVENT",
    entity: "events",
    entity_id: id,
    old_value: { name: event.name },
    new_value: { ...counts, deleted_permanently: true, result: delResult },
  });

  // 4) Cleanup jobs sudah diantrekan SEBELUM delete (lihat langkah 0):
  //    configuration CASCADE bersama event, jobs bertahan sebagai snapshot.

  return NextResponse.json({
    ok: true,
    deleted: delResult,
    excel_cleanup_queued: cleanupQueued,
    message: `Event "${event.name}" berhasil dihapus permanen.${cleanupQueued ? ` ${cleanupQueued} baris Excel masuk antrean pembersihan.` : ""}`,
  });
}
