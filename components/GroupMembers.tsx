"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GroupMembers({
  groupId,
  members,
  available,
  otherGroups,
  canManage,
}: {
  groupId: string;
  members: { id: string; athlete_id: string; name: string }[];
  available: { id: string; name: string }[];
  otherGroups: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function changeMembership(athleteId: string, target: string | null, expected: string | null) {
    if (!athleteId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("change_training_group_membership", {
        p_athlete_id: athleteId, p_group_id: target, p_expected_member_id: expected,
      });
      if (error) throw new Error(error.message);
      if (!expected) setAddId("");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Keanggotaan gagal diperbarui.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
        Anggota ({members.length})
      </div>
      {error && <p role="alert" className="px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-slate-100 text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="flex-1 font-medium text-slate-700">{m.name}</span>
            {canManage && <>
            <select aria-label={`Pindahkan ${m.name}`}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              value=""
              disabled={busy}
              onChange={(e) => {
                const target = e.target.value;
                if (target) void changeMembership(m.athlete_id, target, m.id);
              }}
            >
              <option value="">Pindah ke…</option>
              {otherGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => changeMembership(m.athlete_id, null, m.id)}
              disabled={busy}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Keluarkan
            </button>
            </>}
          </li>
        ))}
        {members.length === 0 && (
          <li className="px-3 py-3 text-center text-xs text-slate-400">Belum ada anggota.</li>
        )}
      </ul>
      {canManage && <div className="flex gap-2 border-t border-slate-100 p-2">
        <select className="input flex-1" value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">+ Tambah atlet ke kelompok…</option>
          {available.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button onClick={() => changeMembership(addId, groupId, null)} disabled={!addId || busy} className="btn-primary text-sm">
          Tambah
        </button>
      </div>}
    </div>
  );
}
