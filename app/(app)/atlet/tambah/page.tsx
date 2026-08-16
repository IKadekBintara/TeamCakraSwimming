import { createClient } from "@/lib/supabase/server";
import AthleteForm from "@/components/AthleteForm";

export const dynamic = "force-dynamic";

export default async function TambahAtletPage() {
  const supabase = createClient();
  const { data: groups } = await supabase
    .from("training_groups")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: parents } = await supabase
    .from("parents")
    .select("id, full_name")
    .order("full_name");

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-14 lg:pt-0">
      <h1 className="text-2xl font-bold">Tambah Atlet</h1>
      <AthleteForm groups={groups ?? []} parents={parents ?? []} mode="create" />
    </div>
  );
}
