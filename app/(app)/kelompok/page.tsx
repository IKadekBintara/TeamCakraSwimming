import { createClient } from "@/lib/supabase/server";
import GroupForm from "@/components/GroupForm";
import GroupMembers from "@/components/GroupMembers";
import ScheduleManager from "@/components/ScheduleManager";

export const dynamic = "force-dynamic";

export default async function KelompokPage() {
  const supabase = createClient();

  const [{ data: groups }, { data: coaches }, { data: leaders }, { data: members }, { data: schedules }, { data: allAthletes }] = await Promise.all([
    supabase.from("training_groups").select("*, coaches(full_name), leader:leader_id(full_name)").order("name"),
    supabase.from("coaches").select("id, full_name").order("full_name"),
    supabase.from("profiles").select("id, full_name, role").in("role", ["group_leader", "coach", "admin"]).order("full_name"),
    supabase.from("training_group_members").select("id, group_id, athlete_id, athletes(full_name, status)").is("left_at", null),
    supabase.from("training_schedules").select("*").order("day_of_week").order("start_time"),
    supabase.from("athletes").select("id, full_name, status").eq("status", "ACTIVE").order("full_name"),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Kelompok Latihan</h1>
        <p className="text-sm text-slate-500">
          Kelompok bersifat dinamis — tambah kelompok baru kapan saja tanpa mengubah kode
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(groups ?? []).length === 0 && (
            <div className="card text-center text-sm text-slate-500">
              Belum ada kelompok. Buat kelompok pertama di formulir samping.
            </div>
          )}
          {(groups ?? []).map((g) => {
            const groupMembers = (members ?? []).filter((m) => m.group_id === g.id);
            const groupSchedules = (schedules ?? []).filter((s) => s.group_id === g.id);
            const assignedIds = new Set((members ?? []).map((m) => m.athlete_id));
            const available = (allAthletes ?? []).filter((a) => !assignedIds.has(a.id));
            return (
              <div key={g.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">{g.name}</p>
                      <span className={`badge ${g.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {g.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {g.location ?? "Lokasi belum diatur"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Pelatih: {(g.coaches as { full_name?: string } | null)?.full_name ?? "—"} •{" "}
                      Ketua: {(g.leader as { full_name?: string } | null)?.full_name ?? "—"} •{" "}
                      {groupMembers.length} atlet
                    </p>
                  </div>
                  <GroupForm
                    coaches={coaches ?? []}
                    leaders={(leaders ?? []).map((l) => ({ id: l.id, full_name: l.full_name }))}
                    group={{ id: g.id, name: g.name, location: g.location, coach_id: g.coach_id, leader_id: g.leader_id, is_active: g.is_active }}
                    compact
                  />
                </div>

                <ScheduleManager groupId={g.id} schedules={groupSchedules} />

                <GroupMembers
                  groupId={g.id}
                  members={groupMembers.map((m) => ({
                    id: m.id,
                    athlete_id: m.athlete_id,
                    name: (m.athletes as { full_name?: string } | null)?.full_name ?? "—",
                  }))}
                  available={available.map((a) => ({ id: a.id, name: a.full_name }))}
                  otherGroups={(groups ?? []).filter((og) => og.id !== g.id).map((og) => ({ id: og.id, name: og.name }))}
                />
              </div>
            );
          })}
        </div>

        <div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Tambah Kelompok</h2>
            <GroupForm
              coaches={coaches ?? []}
              leaders={(leaders ?? []).map((l) => ({ id: l.id, full_name: l.full_name }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
