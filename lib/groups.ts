import { createClient } from "@/lib/supabase/server";

/** Daftar kelompok latihan dari database — satu sumber kebenaran training_groups. SERVER-ONLY (jangan diimport komponen klien). */
export async function getCakraGroups(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient();
  const { data } = await supabase.from("training_groups").select("id, name").eq("is_active", true).order("name");
  return data ?? [];
}
