import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/supabase/auth-helper";

/** Daftar kelompok latihan (satu sumber kebenaran: tabel training_groups). */
export async function GET() {
  const supabase = createClient();
  const { user } = await getAuth();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { data, error } = await supabase.from("training_groups").select("id, name").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
