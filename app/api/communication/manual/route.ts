import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyInApp } from "@/lib/notifications/service";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/communication/manual — kirim notifikasi manual ke role (admin/operator).
 * body: { target_role: string, title: string, message: string }
 * Audit: MANUAL_NOTIFICATION. Tidak menerima recipient_id bebas dari client
 * (mencegah admin menulis notifikasi atas nama user lain secara arbitrer).
 */
const ALLOWED_ROLES = ["parent", "athlete", "coach", "group_leader", "ketua_kelompok", "operator", "admin"];

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, "comm-manual", 10);
  if (rl) return rl;
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

  let body: { target_role?: string; title?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!ALLOWED_ROLES.includes(body.target_role ?? "") || !title || !message) {
    return NextResponse.json({ error: "target_role, title, message wajib" }, { status: 400 });
  }
  if (title.length > 120 || message.length > 1000) {
    return NextResponse.json({ error: "Konten terlalu panjang" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: recipients } = await svc
    .from("profiles")
    .select("id")
    .eq("role", body.target_role);

  let count = 0;
  for (const r of recipients ?? []) {
    const nid = await notifyInApp({
      recipientId: r.id,
      ntype: "SYSTEM",
      title,
      message,
      linkPath: "/notifications",
      dispatchKey: `manual:${crypto.randomUUID()}`,
    });
    if (nid) count++;
  }

  await svc.from("audit_logs").insert({
    actor_id: user.id,
    action: "MANUAL_NOTIFICATION",
    entity: "notifications",
    entity_id: null,
    new_value: { target_role: body.target_role, title, message, recipients: count },
  });

  return NextResponse.json({ ok: true, sent: count });
}
