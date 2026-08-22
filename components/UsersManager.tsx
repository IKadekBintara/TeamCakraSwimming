"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/types";

export default function UsersManager({
  profiles,
}: {
  profiles: { id: string; full_name: string; role: Role; phone: string | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setRole(userId: string, role: Role) {
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: userId, action: "update", full_name: profiles.find((p) => p.id === userId)?.full_name || "", role, phone: profiles.find((p) => p.id === userId)?.phone || null, account_status: "ACTIVE" }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Gagal mengubah role");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah role");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-x-auto p-0">
      {error && (
        <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {profiles.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-medium text-slate-800">{p.full_name}</td>
              <td className="px-4 py-3">
                <select
                  value={p.role}
                  disabled={busy === p.id}
                  onChange={(e) => setRole(p.id, e.target.value as Role)}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {profiles.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                Belum ada pengguna terdaftar.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
