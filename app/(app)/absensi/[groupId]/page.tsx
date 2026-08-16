import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AttendanceSheet from "@/components/AttendanceSheet";

export const dynamic = "force-dynamic";

export default async function AbsensiGroupPage({
  params,
  searchParams,
}: {
  params: { groupId: string };
  searchParams: { date?: string };
}) {
  const supabase = createClient();
  const date = searchParams.date ?? new Date().toISOString().slice(0, 10);

  const { data: group } = await supabase
    .from("training_groups")
    .select("id, name, location, coach_id")
    .eq("id", params.groupId)
    .single();

  if (!group) notFound();

  // Ambil jadwal aktif grup untuk default jam sesi
  const { data: schedule } = await supabase
    .from("training_schedules")
    .select("start_time, end_time, location")
    .eq("group_id", group.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  // Get or create session
  let { data: session } = await supabase
    .from("training_sessions")
    .select("id")
    .eq("group_id", group.id)
    .eq("session_date", date)
    .maybeSingle();

  if (!session) {
    const { data: created, error } = await supabase
      .from("training_sessions")
      .insert({
        group_id: group.id,
        session_date: date,
        start_time: schedule?.start_time ?? null,
        end_time: schedule?.end_time ?? null,
        location: schedule?.location ?? group.location,
        coach_id: group.coach_id,
      })
      .select("id")
      .single();
    if (error) {
      return (
        <div className="mx-auto max-w-2xl pt-14 lg:pt-0">
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            Gagal membuat sesi: {error.message}
          </p>
        </div>
      );
    }
    session = created;
  }

  // Anggota aktif grup (dari tabel members)
  const { data: members } = await supabase
    .from("training_group_members")
    .select("athlete_id, athletes(id, full_name, nickname, status)")
    .eq("group_id", group.id)
    .is("left_at", null);

  const athletes = (members ?? [])
    .flatMap((m) => {
      const a = m.athletes as unknown;
      const obj = Array.isArray(a) ? a[0] : a;
      return obj ? [obj as { id: string; full_name: string; nickname: string | null; status: string }] : [];
    })
    .filter((a) => a.status === "ACTIVE")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const { data: existing } = await supabase
    .from("attendance")
    .select("athlete_id, status")
    .eq("session_id", session!.id);

  const initial: Record<string, string> = {};
  for (const a of existing ?? []) initial[a.athlete_id] = a.status;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">{group.name}</h1>
        <p className="text-sm text-slate-500">
          {date}
          {schedule ? ` • ${String(schedule.start_time).slice(0, 5)}–${String(schedule.end_time).slice(0, 5)}` : ""}
          {group.location ? ` • ${group.location}` : ""}
        </p>
      </div>

      <AttendanceSheet
        sessionId={session!.id}
        athletes={athletes.map((a) => ({
          id: a.id,
          name: a.nickname ? `${a.full_name} (${a.nickname})` : a.full_name,
        }))}
        initial={initial}
      />
    </div>
  );
}
