import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/communication/settings — update automation settings (admin/operator).
 * body: { id: 'payment_reminder'|'event_deadline_reminder', enabled?, offsets_hours? }
 * Audit: UPDATE_AUTOMATION_SETTING.
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

  let body: { id?: string; enabled?: boolean; offsets_hours?: number[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }
  if (!["payment_reminder", "event_deadline_reminder"].includes(body.id ?? "")) {
    return NextResponse.json({ error: "Setting tidak dikenal" }, { status: 400 });
  }

  if (body.offsets_hours !== undefined) {
    if (
      !Array.isArray(body.offsets_hours) ||
      body.offsets_hours.length === 0 ||
      !body.offsets_hours.every((n) => Number.isInteger(n) && n > 0 && n <= 24 * 30)
    ) {
      return NextResponse.json({ error: "offsets_hours tidak valid" }, { status: 400 });
    }
  }

  const svc = createServiceClient();
  const { data: before } = await svc
    .from("automation_settings")
    .select("enabled, offsets_hours")
    .eq("id", body.id)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.offsets_hours) patch.offsets_hours = Array.from(new Set(body.offsets_hours)).sort((a, b) => a - b);

  const { error } = await svc.from("automation_settings").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Gagal menyimpan setting" }, { status: 500 });

  await svc.from("audit_logs").insert({
    actor_id: user.id,
    action: "UPDATE_AUTOMATION_SETTING",
    entity: "automation_settings",
    entity_id: body.id,
    old_value: before ?? null,
    new_value: patch,
  });

  return NextResponse.json({ ok: true });
}
