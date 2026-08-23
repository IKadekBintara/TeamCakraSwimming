import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET  /api/notifications/prefs — preferensi notifikasi user.
 * PATCH /api/notifications/prefs { in_app_enabled?, email_enabled?, whatsapp_enabled? }
 * Email/WA hanya flag preferensi; channel aktual belum terkonfigurasi (lihat providers.ts).
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let { data: prefs } = await supabase
    .from("notification_prefs")
    .select("in_app_enabled, email_enabled, whatsapp_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!prefs) {
    // default baris pertama kali dibaca
    ({ data: prefs } = await supabase
      .from("notification_prefs")
      .upsert({ user_id: user.id }, { onConflict: "user_id" })
      .select("in_app_enabled, email_enabled, whatsapp_enabled")
      .single());
  }
  return NextResponse.json({ prefs });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { in_app_enabled?: boolean; email_enabled?: boolean; whatsapp_enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  for (const k of ["in_app_enabled", "email_enabled", "whatsapp_enabled"] as const) {
    if (typeof body[k] === "boolean") patch[k] = body[k] as boolean;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
