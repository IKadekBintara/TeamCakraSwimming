import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/communication/retry — retry delivery yang gagal (admin/operator).
 * body: { id: string }
 * Hanya FAILED dengan attempts < 3 yang boleh di-retry. Audit: RETRY_NOTIFICATION.
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

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

  const svc = createServiceClient();
  const { data: d } = await svc
    .from("notification_deliveries")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (!d) return NextResponse.json({ error: "Delivery tidak ditemukan" }, { status: 404 });
  if (d.status !== "FAILED") {
    return NextResponse.json({ error: "Hanya delivery FAILED yang bisa di-retry" }, { status: 400 });
  }
  if (d.attempts >= 3) {
    return NextResponse.json({ error: "Batas retry tercapai" }, { status: 400 });
  }

  // Provider belum dikonfigurasi -> attempt ini tetap akan gagal,
  // tapi tercatat jujur di log (channel belum siap).
  const attempts = d.attempts + 1;
  await svc
    .from("notification_deliveries")
    .update({ attempts, last_attempt_at: new Date().toISOString(), status: "FAILED", error: "Provider belum dikonfigurasi (retry manual)" })
    .eq("id", body.id);

  await svc.from("audit_logs").insert({
    actor_id: user.id,
    action: "RETRY_NOTIFICATION",
    entity: "notification_deliveries",
    entity_id: body.id,
    old_value: { attempts: d.attempts },
    new_value: { attempts },
  });

  return NextResponse.json({ ok: true, attempts });
}
