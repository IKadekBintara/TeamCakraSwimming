import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const supabase = createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, old_value, new_value, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-slate-500">100 aktivitas terakhir</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">Waktu</th>
              <th className="px-4 py-3">Aktor</th>
              <th className="px-4 py-3">Aksi</th>
              <th className="px-4 py-3">Entitas</th>
              <th className="px-4 py-3">Sebelum → Sesudah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                  {new Date(l.created_at).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-2.5">{(l.profiles as { full_name?: string } | null)?.full_name ?? "system"}</td>
                <td className="px-4 py-2.5 font-medium">{l.action}</td>
                <td className="px-4 py-2.5 text-slate-600">{l.entity}</td>
                <td className="max-w-xs px-4 py-2.5 text-xs text-slate-500">
                  <code className="block truncate">
                    {l.old_value ? JSON.stringify(l.old_value) : "—"} → {l.new_value ? JSON.stringify(l.new_value) : "—"}
                  </code>
                </td>
              </tr>
            ))}
            {(logs ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Belum ada aktivitas tercatat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
