import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function admin() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: profile } = await client.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") return { error: 403 as const };
  return { user, service: createServiceClient(), userId: user.id };
}

function fail(message: string, status?: number | string, requestId?: string) {
  if (typeof status === "string") {
    requestId = status;
    status = 400;
  }
  const st = (status as number) ?? 400;
  if (requestId) {
    console.error(`[excel-sync][${requestId}] ${st}: ${message}`);
    return NextResponse.json({ error: message, request_id: requestId }, { status: st });
  }
  return NextResponse.json({ error: message }, { status: st });
}

/** Request id untuk korelasi log server ↔ response UI. */
function newRequestId(stage: string) {
  const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[excel-sync][${rid}] start ${stage}`);
  return rid;
}

/**
 * PATCH [id] — aksi per-konfigurasi:
 *  { action: "toggle_config" | "update_config" | "delete_config" | "sync_now", ... }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rid = newRequestId("mutation");
  const ctx = await admin();
  if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error, rid);
  const db = ctx.service;
  const b = await req.json().catch(() => null);
  if (!b?.action) return fail("action wajib", rid);

  if (b.action === "set_global") {
    return fail("set_global gunakan PATCH /api/admin/excel-sync (tanpa id)", rid);
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return fail("id tidak valid", rid);
  const { data: cfg } = await db.from("excel_sync_configurations").select("*").eq("id", id).maybeSingle();
  if (!cfg) return fail("Konfigurasi tidak ditemukan", 404, rid);

  switch (b.action) {
    case "toggle_config": {
      const enabled = Boolean(b.enabled);
      const { error } = await db.from("excel_sync_configurations")
        .update({ enabled, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return fail(error.message, 500, rid);
      await db.from("excel_sync_logs").insert({
        action: enabled ? "SYNC_ENABLED" : "SYNC_DISABLED",
        configuration_id: id, event_id: cfg.event_id, actor_id: ctx.userId,
        detail: { name: cfg.name },
      });
      return NextResponse.json({ ok: true, enabled });
    }

    case "update_config": {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.name !== undefined) patch.name = String(b.name).trim();
      if (b.file_path !== undefined) patch.file_path = String(b.file_path).trim();
      if (b.worksheet_name !== undefined) patch.worksheet_name = String(b.worksheet_name).trim();
      if (b.header_row !== undefined) patch.header_row = Number(b.header_row);
      if (b.first_data_row !== undefined) patch.first_data_row = Number(b.first_data_row);
      if (b.max_row !== undefined) patch.max_row = b.max_row === null || b.max_row === "" ? null : Number(b.max_row);
      if (b.mapping !== undefined) patch.mapping = b.mapping;
      if (b.duplicate_strategy !== undefined) patch.duplicate_strategy = b.duplicate_strategy === "update_empty_fields" ? "update_empty_fields" : "skip";
      if (b.checkbox_fields !== undefined) patch.checkbox_fields = b.checkbox_fields;
      if (b.ku_format !== undefined) patch.ku_format = b.ku_format === "short" ? "short" : "long";
      if (b.checkbox_group_row !== undefined) patch.checkbox_group_row = b.checkbox_group_row === null || b.checkbox_group_row === "" ? null : Number(b.checkbox_group_row);
      if (b.checkbox_sub_row !== undefined) patch.checkbox_sub_row = b.checkbox_sub_row === null || b.checkbox_sub_row === "" ? null : Number(b.checkbox_sub_row);
      const { data: updated, error } = await db.from("excel_sync_configurations").update(patch).eq("id", id).select().single();
      if (error) return fail(error.message, 500, rid);
      await db.from("excel_sync_logs").insert({
        action: "CONFIG_UPDATED", configuration_id: id, event_id: cfg.event_id, actor_id: ctx.userId,
        detail: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
      });
      return NextResponse.json({ configuration: updated });
    }

    case "delete_config": {
      // HANYA configuration — event, registration, payment, dan file Excel tidak disentuh.
      const { error } = await db.from("excel_sync_configurations").delete().eq("id", id);
      if (error) return fail(error.message, 500, rid);
      await db.from("excel_sync_logs").insert({
        action: "CONFIG_DELETED", event_id: cfg.event_id, actor_id: ctx.userId,
        detail: { name: cfg.name, file_path: cfg.file_path },
      });
      return NextResponse.json({ ok: true });
    }

    case "sync_now": {
      if (!cfg.enabled) {
        return fail("Konfigurasi sedang DISABLED — aktifkan dulu atau gunakan Enable & Sync", 409, rid);
      }
      const global = await db.from("excel_sync_settings").select("enabled").eq("id", "global").maybeSingle();
      if (!global.data?.enabled) return fail("Excel Sync sedang OFF secara global", 409, rid);

      // Enqueue job reconcile penuh untuk config ini (worker fetch current state & isi yang kurang).
      const { error } = await db.from("excel_sync_jobs").insert({
        configuration_id: id, action: "reconcile",
        payload: { trigger: "manual_sync_now", requested_by: ctx.userId },
      });
      if (error) {
        // Dedupe: job (config, action) yang sama masih PENDING/RETRYING — bukan kegagalan.
        if ((error as { code?: string }).code === "23505") {
          await db.from("excel_sync_logs").insert({
            action: "SYNC_STARTED", configuration_id: id, event_id: cfg.event_id, actor_id: ctx.userId,
            detail: { trigger: "sync_now", deduped: true },
          });
          return NextResponse.json({ ok: true, queued: false, deduped: true, message: "Sync sudah dijadwalkan" });
        }
        return fail(error.message, 500, rid);
      }
      await db.from("excel_sync_logs").insert({
        action: "SYNC_STARTED", configuration_id: id, event_id: cfg.event_id, actor_id: ctx.userId,
        detail: { trigger: "sync_now" },
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    default:
      return fail("action tidak dikenal", rid);
  }
}

/** POST: aksi diagnostik — enqueue job test_connection / dry_run.
 *  Sengaja TIDAK memerlukan sync enabled: diagnostik justru untuk memeriksa kesiapan. */
export async function POST(req: NextRequest, ctx2: { params: { id: string } }) {
  const rid = newRequestId("mutation");
  const ctx = await admin();
  if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error, rid);
  const { id } = ctx2.params;
  const b = await req.json().catch(() => null);
  if (!b || !["test_connection", "dry_run"].includes(b.action)) return fail("action harus test_connection | dry_run", 400, rid);
  const db = ctx.service;

  const { data: cfg } = await db.from("excel_sync_configurations").select("id, event_id").eq("id", id).maybeSingle();
  if (!cfg) return fail("Konfigurasi tidak ditemukan", 404, rid);

  const { error } = await db.from("excel_sync_jobs").insert({
    configuration_id: id, action: b.action,
    payload: { trigger: "manual_diagnostic", requested_by: ctx.userId },
  });
  if (error) {
    // Dedupe diagnostik yang masih antre — aman diabaikan (job lama akan memproses).
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, queued: false, deduped: true, message: "Diagnostik sudah dijadwalkan" });
    }
    return fail(error.message, 500, rid);
  }
  await db.from("excel_sync_logs").insert({
    action: b.action === "test_connection" ? "TEST_CONNECTION_QUEUED" : "DRY_RUN_QUEUED",
    configuration_id: id, event_id: cfg.event_id, actor_id: ctx.userId,
    detail: { trigger: "manual_diagnostic" },
  });
  return NextResponse.json({ ok: true, queued: b.action });
}
