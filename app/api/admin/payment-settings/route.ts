import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

async function adminContext() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: profile } = await client.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") return { error: 403 as const };
  return { user, service: createServiceClient() };
}

export async function PATCH(request: NextRequest) {
  const ctx = await adminContext();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error === 401 ? "Sesi login diperlukan" : "Admin only" }, { status: ctx.error });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  const service = ctx.service;
  const { data: old, error: readError } = await service.from("payment_settings").select("*").eq("id", true).maybeSingle();
  if (readError) return NextResponse.json({ error: "Gagal membaca payment settings" }, { status: 500 });
  const patch = {
    id: true,
    bank_name: typeof body.bank_name === "string" ? body.bank_name.trim() || null : null,
    account_number: typeof body.account_number === "string" ? body.account_number.trim() || null : null,
    account_name: typeof body.account_name === "string" ? body.account_name.trim() || null : null,
    ewallet_name: typeof body.ewallet_name === "string" ? body.ewallet_name.trim() || null : null,
    ewallet_number: typeof body.ewallet_number === "string" ? body.ewallet_number.trim() || null : null,
    instructions: typeof body.instructions === "string" ? body.instructions.trim() || null : null,
    bank_transfer_enabled: Boolean(body.bank_transfer_enabled),
    ewallet_enabled: Boolean(body.ewallet_enabled),
    cash_enabled: Boolean(body.cash_enabled),
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };
  if (!patch.bank_transfer_enabled && !patch.ewallet_enabled && !patch.cash_enabled) return NextResponse.json({ error: "Minimal satu metode pembayaran harus aktif" }, { status: 400 });
  const { error } = await service.from("payment_settings").upsert(patch, { onConflict: "id" });
  if (error) return NextResponse.json({ error: "Gagal menyimpan payment settings" }, { status: 500 });
  await service.from("audit_logs").insert({ actor_id: ctx.user.id, action: "UPDATE_PAYMENT_SETTINGS", entity: "payment_settings", entity_id: "true", old_value: old, new_value: patch });
  return NextResponse.json({ ok: true });
}
