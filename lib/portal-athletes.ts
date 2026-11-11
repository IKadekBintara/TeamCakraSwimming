import type { createClient } from "@/lib/supabase/server";

export async function getPortalAthlete(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestedId?: string,
) {
  const { data, error } = await supabase.from("athletes").select("id,full_name")
    .order("full_name").order("id");
  if (error) throw error;
  const athletes = data ?? [];
  return { athletes, selected: athletes.find((athlete) => athlete.id === requestedId) ?? athletes[0] };
}
