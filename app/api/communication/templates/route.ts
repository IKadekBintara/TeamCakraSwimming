import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/communication/templates  — update template (admin/operator only).
 * body: { key, subject?, body?, is_active? }
 * Perubahan dicatat ke audit_logs (UPDATE_NOTIFICATION_TEMPLATE).
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "operator"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { key?: string; subject?: string; body?: string; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }
  if (!body.key || typeof body.body !== "string") {
    return NextResponse.json({ error: "key dan body wajib" }, { status: 400 });
  }
  if (body.body.length > 5000 || (body.subject && body.subject.length > 300)) {
    return NextResponse.json({ error: "Konten terlalu panjang" }, { status: 400 });
  }

  // old value untuk audit
  const svc = createServiceClient();
  const { data: before } = await svc
    .from("notification_templates")
    .select("subject, body, is_active")
    .eq("key", body.key)
    .maybeSingle();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.subject === "string") patch.subject = body.subject;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  patch.body = body.body;

  const { error } = await svc.from("notification_templates").update(patch).match({ key: body.key });
  if (error) return NextResponse.json({ error: "Gagal menyimpan template" }, { status: 500 });

  await svc.from("audit_logs").insert({
    actor_id: user.id,
    action: "UPDATE_NOTIFICATION_TEMPLATE",
    entity: "notification_templates",
    entity_id: body.key,
    old_value: before ?? null,
    new_value: { subject: patch.subject ?? before?.subject, body: patch.body, is_active: patch.is_active ?? before?.is_active },
  });

  return NextResponse.json({ ok: true });
}
