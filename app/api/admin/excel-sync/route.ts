import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Gate admin: sesi valid + role admin + akun ACTIVE. */
async function admin() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: profile } = await client.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") return { error: 403 as const };
  return { user, service: createServiceClient() };
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

/** GET: settings global + daftar konfigurasi + statistik job + worker status. */
export async function GET() {
  const ctx = await admin();
  if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error);
  const db = ctx.service;

  const [settings, configs, jobs, heartbeat] = await Promise.all([
    db.from("excel_sync_settings").select("enabled, worker_heartbeat, updated_at").eq("id", "global").maybeSingle(),
    db.from("excel_sync_configurations").select("*, events(name, event_date, status)").order("created_at", { ascending: false }),
    db.from("excel_sync_jobs").select("configuration_id, status, count").order("configuration_id"),
    Promise.resolve(null),
  ]);

  const jobStats: Record<string, { PENDING: number; RETRYING: number; FAILED: number; REVIEW_REQUIRED: number; SUCCESS: number }> = {};
  for (const j of jobs.data ?? []) {
    const s = jobStats[j.configuration_id] ??= { PENDING: 0, RETRYING: 0, FAILED: 0, REVIEW_REQUIRED: 0, SUCCESS: 0 };
    if (s[j.status as keyof typeof s] !== undefined) s[j.status as keyof typeof s] += j.count;
  }

  const { data: hb } = await db.from("excel_sync_settings").select("worker_heartbeat, worker_id").eq("id", "global").maybeSingle();
  const lastBeat = hb?.worker_heartbeat ? new Date(hb.worker_heartbeat) : null;
  const beatAge = lastBeat ? Math.max(0, (Date.now() - lastBeat.getTime()) / 1000) : null;
  // Status = f(umur heartbeat aktual). Threshold: ONLINE <45s (≈2× interval
  // heartbeat 15s), DEGRADED <10 menit (masih "hangat", bisa terlambat),
  // OFFLINE setelahnya. Alasan disertakan agar admin paham dasar status.
  let workerStatus: string;
  let statusReason: string;
  if (!lastBeat || beatAge === null) {
    workerStatus = "OFFLINE";
    statusReason = "belum ada heartbeat tercatat";
  } else if (beatAge < 45) {
    workerStatus = "CONNECTED";
    statusReason = `heartbeat ${Math.round(beatAge)} detik lalu`;
  } else if (beatAge < 600) {
    workerStatus = "DEGRADED";
    statusReason = `heartbeat terakhir ${beatAge < 90 ? `${Math.round(beatAge)} detik` : `${Math.round(beatAge / 60)} menit`} lalu`;
  } else {
    workerStatus = "OFFLINE";
    statusReason = `tidak ada heartbeat selama ${Math.round(beatAge / 60)} menit`;
  }

  const logs = await db.from("excel_sync_logs").select("id, action, configuration_id, detail, error_message, created_at").order("created_at", { ascending: false }).limit(50);

  return NextResponse.json({
    settings: settings.data,
    worker: { status: workerStatus, status_reason: statusReason, worker_id: hb?.worker_id ?? null, last_heartbeat: lastBeat?.toISOString() ?? null },
    configurations: configs.data ?? [],
    job_stats: jobStats,
    logs: logs.data ?? [],
  });
}

/** PATCH collection: hanya aksi global (tanpa id). Aksi per-config ada di /[id]. */
export async function PATCH(req: NextRequest) {
  const rid = newRequestId("mutation");
  const ctx = await admin();
  if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error, rid);
  const b = await req.json().catch(() => null);
  if (!b?.action) return fail("action wajib", rid);
  if (b.action !== "set_global") return fail("Aksi per-konfigurasi gunakan PATCH /api/admin/excel-sync/{id}", rid);

  const enabled = Boolean(b.enabled);
  const { error } = await ctx.service.from("excel_sync_settings")
    .update({ enabled, updated_by: ctx.user.id, updated_at: new Date().toISOString() })
    .eq("id", "global");
  if (error) return fail(error.message, 500, rid);
  await ctx.service.from("excel_sync_logs").insert({
    action: enabled ? "GLOBAL_ENABLED" : "GLOBAL_DISABLED", actor_id: ctx.user.id,
    detail: { enabled },
  });
  return NextResponse.json({ ok: true, enabled });
}

/** POST: buat konfigurasi baru. */
export async function POST(req: NextRequest) {
  const rid = newRequestId("mutation");
  const ctx = await admin();
  if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error, rid);
  const b = await req.json().catch(() => null);
  if (!b) return fail("Body tidak valid", rid);

  const name = String(b.name ?? "").trim();
  const event_id = String(b.event_id ?? "");
  const file_path = String(b.file_path ?? "").trim();
  const worksheet_name = String(b.worksheet_name ?? "").trim();
  if (!name) return fail("Nama konfigurasi wajib diisi", rid);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event_id)) return fail("Event tidak valid", rid);
  if (!file_path) return fail("File Excel wajib diisi", rid);
  if (!worksheet_name) return fail("Worksheet wajib diisi", rid);

  const { data: ev } = await ctx.service.from("events").select("id").eq("id", event_id).maybeSingle();
  if (!ev) return fail("Event tidak ditemukan", 404, rid);

  const { data: dup } = await ctx.service
    .from("excel_sync_configurations")
    .select("id")
    .eq("event_id", event_id).eq("file_path", file_path).eq("worksheet_name", worksheet_name)
    .maybeSingle();
  if (dup) return fail("Konfigurasi untuk event+file+worksheet ini sudah ada", 409, rid);

  const { data: cfg, error } = await ctx.service
    .from("excel_sync_configurations")
    .insert({
      name, event_id, file_path, worksheet_name,
      header_row: Number(b.header_row ?? 21),
      first_data_row: Number(b.first_data_row ?? 22),
      max_row: b.max_row ? Number(b.max_row) : null,
      mapping: b.mapping ?? {},
      duplicate_strategy: b.duplicate_strategy === "update_empty_fields" ? "update_empty_fields" : "skip",
      enabled: Boolean(b.enabled ?? false),
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) return fail(error.message, 500, rid);

  await ctx.service.from("excel_sync_logs").insert({
    action: "CONFIG_CREATED", configuration_id: cfg.id, event_id, actor_id: ctx.user.id,
    detail: { name, file_path, worksheet_name },
  });
  return NextResponse.json({ configuration: cfg }, { status: 201 });
}
