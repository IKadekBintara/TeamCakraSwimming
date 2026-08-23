import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function safeJson(v: unknown): string {
  if (v == null) return "—";
  try {
    const s = JSON.stringify(v);
    // Jangan tampilkan nilai yang menyerupai token/secret
    if (/token|secret|password|key/i.test(s)) return "[disembunyikan]";
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "—";
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { actor?: string; action?: string; from?: string; to?: string; page?: string };
}) {
  const supabase = createClient();
  const fActor = searchParams.actor?.trim() ?? "";
  const fAction = searchParams.action?.trim() ?? "";
  const from = searchParams.from ?? "";
  const to = searchParams.to ?? "";
  const page = Math.max(1, Number(searchParams.page || 1));
  const rngFrom = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, old_value, new_value, created_at, profiles(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(rngFrom, rngFrom + PAGE_SIZE - 1);
  if (fAction) query = query.ilike("action", `%${fAction}%`);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  const { data: logs, count } = await query;

  // Filter actor dilakukan di server kecil (nama actor ada di relasi profiles)
  const rows = (logs ?? []).filter((l) => {
    if (!fActor) return true;
    const name = (l.profiles as { full_name?: string } | null)?.full_name ?? "system";
    return name.toLowerCase().includes(fActor.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (over: Record<string, string>) => {
    const sp = new URLSearchParams({ actor: fActor, action: fAction, from, to, page: String(page), ...over });
    return `/audit?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">{count ?? 0} aktivitas tercatat — jejak semua aksi sensitif sistem.</p>
        </div>
      </header>

      <form method="get" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="label">Aktor
          <input className="input" name="actor" defaultValue={fActor} placeholder="Nama admin/coach…" />
        </label>
        <label className="label">Aksi
          <input className="input" name="action" defaultValue={fAction} placeholder="verify_payment…" />
        </label>
        <label className="label">Dari
          <input className="input" type="date" name="from" defaultValue={from} />
        </label>
        <label className="label">Sampai
          <input className="input" type="date" name="to" defaultValue={to} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">Filter</button>
          <Link href="/audit" className="btn-secondary">Reset</Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Belum ada aktivitas pada filter ini.</p>
          <p className="empty-state-desc">Log terisi otomatis saat admin melakukan aksi konfigurasi, verifikasi, atau perubahan akun.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table !min-w-[880px]">
            <thead>
              <tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th><th>Sebelum → Sesudah</th></tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-slate-500">{new Date(l.created_at).toLocaleString("id-ID")}</td>
                  <td className="font-medium">{(l.profiles as { full_name?: string } | null)?.full_name ?? "system"}</td>
                  <td><span className="badge-neutral badge">{l.action}</span></td>
                  <td className="text-slate-600">{l.entity}</td>
                  <td className="max-w-xs"><code className="block truncate text-xs text-slate-500" title={`${safeJson(l.old_value)} → ${safeJson(l.new_value)}`}>
                    {safeJson(l.old_value)} → {safeJson(l.new_value)}
                  </code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Navigasi halaman" className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Halaman {page} dari {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs({ page: String(page - 1) })} className="btn-secondary px-3 py-1.5">← Sebelumnya</Link>}
            {page < totalPages && <Link href={qs({ page: String(page + 1) })} className="btn-secondary px-3 py-1.5">Berikutnya →</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
