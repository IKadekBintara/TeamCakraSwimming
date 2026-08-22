import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

async function admin() {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: profile } = await client.from("profiles").select("role,account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status !== "ACTIVE") return { error: 403 as const };
  return { user, service: createServiceClient() };
}
const EVENT_STATUSES = new Set(["DRAFT", "OPEN", "CLOSED", "ARCHIVED"]);
function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await admin(); if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error);
  const [{ data: event, error: eventError }, { data: races, error: raceError }] = await Promise.all([
    ctx.service.from("events").select("id,name,event_date,location,description,registration_deadline,status,fee_per_entry,admin_fee,contact_person,contact_whatsapp,payment_instructions").eq("id", params.id).single(),
    ctx.service.from("event_races").select("id,event_id,name,distance_m,stroke,allowed_kus,is_relay,is_active,sort_order,price,is_free").eq("event_id", params.id).order("sort_order"),
  ]);
  if (eventError || raceError) return fail(eventError?.message || raceError?.message || "Gagal membaca konfigurasi", 500);
  return NextResponse.json({ event, races: races || [] });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await admin(); if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error);
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action === "event") {
    if (!String(body.name || "").trim() || !body.event_date) return fail("Nama event dan tanggal wajib diisi");
    if (!EVENT_STATUSES.has(String(body.status))) return fail("Status event tidak valid");
    if (body.registration_deadline && body.registration_deadline > body.event_date) return fail("Deadline tidak boleh setelah tanggal event");
    const patch = { name: String(body.name).trim(), event_date: body.event_date, location: body.location || null, description: body.description || null, registration_deadline: body.registration_deadline || null, status: body.status, admin_fee: Number(body.admin_fee || 0), contact_person: body.contact_person || null, contact_whatsapp: body.contact_whatsapp || null, payment_instructions: body.payment_instructions || null, updated_at: new Date().toISOString() };
    if (patch.admin_fee < 0) return fail("Biaya admin tidak boleh negatif");
    const { data: old } = await ctx.service.from("events").select("*").eq("id", params.id).single();
    const { error } = await ctx.service.from("events").update(patch).eq("id", params.id);
    if (error) return fail(error.message);
    await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: "UPDATE_EVENT_RULES", entity: "events", entity_id: params.id, old_value: old, new_value: patch });
    return NextResponse.json({ ok: true });
  }
  if (action === "race") {
    const id = String(body.id || "");
    const price = Number(body.price || 0);
    if (!String(body.name || "").trim() || !String(body.stroke || "").trim()) return fail("Nama nomor dan gaya wajib diisi");
    if (price < 0 || !Number.isFinite(price)) return fail("Harga tidak valid");
    const patch = { name: String(body.name).trim(), distance_m: Number(body.distance_m), stroke: String(body.stroke).trim(), allowed_kus: Array.isArray(body.allowed_kus) ? body.allowed_kus : [], is_relay: Boolean(body.is_relay), is_active: Boolean(body.is_active), sort_order: Number(body.sort_order || 0), price: Boolean(body.is_free) ? 0 : price, is_free: Boolean(body.is_free) };
    if (!patch.distance_m || patch.distance_m < 1 || !patch.allowed_kus.length) return fail("Jarak dan minimal satu KU wajib diisi");
    const query = id ? ctx.service.from("event_races").update(patch).eq("id", id).eq("event_id", params.id) : ctx.service.from("event_races").insert({ ...patch, event_id: params.id });
    const { error } = await query;
    if (error) return fail(error.message);
    await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: id ? "UPDATE_EVENT_RACE_RULE" : "CREATE_EVENT_RACE_RULE", entity: "event_races", entity_id: id || params.id, new_value: patch });
    return NextResponse.json({ ok: true });
  }
  return fail("Aksi konfigurasi tidak dikenali");
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await admin(); if ("error" in ctx) return fail(ctx.error === 401 ? "Sesi login diperlukan" : "Admin only", ctx.error);
  const raceId = request.nextUrl.searchParams.get("race_id");
  if (!raceId) return fail("race_id wajib diisi");
  const { count } = await ctx.service.from("event_registration_entries").select("id", { count: "exact", head: true }).eq("race_id", raceId);
  if ((count || 0) > 0) return fail("Nomor sudah dipakai pendaftaran lama. Nonaktifkan, jangan hapus.", 409);
  const { error } = await ctx.service.from("event_races").delete().eq("id", raceId).eq("event_id", params.id);
  if (error) return fail(error.message);
  await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: "DELETE_EVENT_RACE_RULE", entity: "event_races", entity_id: raceId });
  return NextResponse.json({ ok: true });
}
