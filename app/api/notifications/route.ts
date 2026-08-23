import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/notifications?unread=1&limit=20 — notifikasi user yang sedang login. */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit") ?? 20));

  let q = supabase
    .from("notifications")
    .select("id, title, message, ntype, link_path, is_read, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.eq("is_read", false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Gagal memuat" }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
