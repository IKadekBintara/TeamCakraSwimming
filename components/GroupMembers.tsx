"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GroupMembers({
  groupId,
  members,
  available,
  otherGroups,
}: {
  groupId: string;
  members: { id: string; athlete_id: string; name: string }[];
  available: { id: string; name: string }[];
  otherGroups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [addId, setAddId] = useState("");
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function addMember() {
    if (!addId) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("training_group_members").insert({
      group_id: groupId, athlete_id: addId, joined_at: today,
    });
    setAddId("");
    setBusy(false);
    router.refresh();
  }

  async function removeMember(memberId: string) {
    setBusy(true);
    await supabase
      .from("training_group_members")
      .update({ left_at: new Date().toISOString().slice(0, 10) })
      .eq("id", memberId);
    setBusy(false);
    router.refresh();
  }

  async function moveMember(memberId: string, athleteId: string, targetGroup: string) {
    if (!targetGroup) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("training_group_members").update({ left_at: today }).eq("id", memberId);
    await supabase.from("training_group_members").insert({
      group_id: targetGroup, athlete_id: athleteId, joined_at: today,
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
        Anggota ({members.length})
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="flex-1 font-medium text-slate-700">{m.name}</span>
            <select
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              value={moveTarget[m.athlete_id] ?? ""}
              disabled={busy}
              onChange={(e) => {
                const target = e.target.value;
                setMoveTarget((s) => ({ ...s, [m.athlete_id]: target }));
                if (target) moveMember(m.id, m.athlete_id, target);
              }}
            >
              <option value="">Pindah ke…</option>
              {otherGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => removeMember(m.id)}
              disabled={busy}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Keluarkan
            </button>
          </li>
        ))}
        {members.length === 0 && (
          <li className="px-3 py-3 text-center text-xs text-slate-400">Belum ada anggota.</li>
        )}
      </ul>
      <div className="flex gap-2 border-t border-slate-100 p-2">
        <select className="input flex-1" value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">+ Tambah atlet ke kelompok…</option>
          {available.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button onClick={addMember} disabled={!addId || busy} className="btn-primary text-sm">
          Tambah
        </button>
      </div>
    </div>
  );
}
