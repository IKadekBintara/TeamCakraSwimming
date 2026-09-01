import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Hapus registrasi atlet dari suatu event (admin only).
 *  Body: { registration_id: uuid }
 *  Efek: entries + payment ikut dihapus → trigger DB meng-enqueue job
 *  delete_registration → worker membersihkan baris Excel + kompaksi nomor. */
async function admin() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: profile } = await client.from("profiles").select("role,account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") return { error: 403 as const };
  return { user, service: createServiceClient() };
}

function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: NextRequest) {
  const ctx = await admin(); if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error);
  const body = await request.json().catch(() => null);
  const regId = String(body?.registration_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(regId)) return fail("registration_id tidak valid");

  const service = ctx.service;
  const { data: reg, error: regErr } = await service.from("event_registrations")
    .select("id, event_id, athlete_id, ku, status").eq("id", regId).maybeSingle();
  if (regErr) return fail(regErr.message, 500);
  if (!reg) return fail("Registrasi tidak ditemukan", 404);

  // Snapshot untuk audit (event & atlet bisa ikut hilang tergantung FK cascade)
  const { data: ev } = await service.from("events").select("name").eq("id", reg.event_id).maybeSingle();
  const { data: ath } = await service.from("athletes").select("full_name").eq("id", reg.athlete_id).maybeSingle();

  // Urutan sama dengan pola existing (entries → payments → registration)
  const delE = await service.from("event_registration_entries").delete().eq("registration_id", regId);
  const delP = await service.from("event_payments").delete().eq("registration_id", regId);
  const delR = await service.from("event_registrations").delete().eq("id", regId);
  const err = delE.error || delP.error || delR.error;
  if (err) return fail(err.message, 500);

  await service.from("audit_logs").insert({
    actor_id: ctx.user.id,
    action: "DELETE_EVENT_REGISTRATION",
    entity: "event_registrations",
    entity_id: regId,
    old_value: { event: ev?.name ?? reg.event_id, athlete: ath?.full_name ?? reg.athlete_id, ku: reg.ku, status: reg.status },
  });

  return NextResponse.json({ ok: true, deleted: regId });
}
