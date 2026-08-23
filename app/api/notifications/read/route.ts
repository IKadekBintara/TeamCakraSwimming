import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/notifications/read
 * body: { id?: string, all?: boolean }
 * User hanya dapat menandai notifikasi miliknya sendiri (RLS + filter ganda).
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (body.all) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .eq("is_read", false);
    if (error) return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .match({ id: body.id, recipient_id: user.id })
      .select("id");
    if (error) return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 });
    if ((data ?? []).length === 0) {
      return NextResponse.json({ error: "Notifikasi bukan milik Anda" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id atau all wajib" }, { status: 400 });
}
