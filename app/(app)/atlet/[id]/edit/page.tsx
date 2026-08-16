import { createClient } from "@/lib/supabase/server";
import AthleteForm from "@/components/AthleteForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditAtletPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [{ data: athlete }, { data: groups }, { data: parents }, { data: membership }] = await Promise.all([
    supabase.from("athletes").select("*").eq("id", params.id).single(),
    supabase.from("training_groups").select("id, name").eq("is_active", true).order("name"),
    supabase.from("parents").select("id, full_name").order("full_name"),
    supabase
      .from("training_group_members")
      .select("group_id")
      .eq("athlete_id", params.id)
      .is("left_at", null)
      .maybeSingle(),
  ]);

  if (!athlete) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-14 lg:pt-0">
      <h1 className="text-2xl font-bold">Edit Atlet</h1>
      <AthleteForm
        groups={groups ?? []}
        parents={parents ?? []}
        mode="edit"
        athlete={{ ...athlete, current_group_id: membership?.group_id ?? "" }}
      />
    </div>
  );
}
