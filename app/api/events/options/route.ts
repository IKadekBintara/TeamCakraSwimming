import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Daftar event untuk picker (semua status; jumlah pendaftar dihitung). */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesi login diperlukan" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("events")
    .select("id, name, event_date, status, event_registrations(count)")
    .order("event_date", { ascending: false });
  if (error) return NextResponse.json({ error: "Gagal memuat event" }, { status: 500 });

  const events = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    event_date: r.event_date,
    status: r.status,
    registrations: Array.isArray(r.event_registrations) ? Number((r.event_registrations[0] as { count?: number })?.count ?? 0) : 0,
  }));
  return NextResponse.json({ events });
}
