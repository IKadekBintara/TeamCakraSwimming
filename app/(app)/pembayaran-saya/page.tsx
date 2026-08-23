import { getProfile } from "@/lib/page-guard";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** PEMBAYARAN SAYA — tagihan & pembayaran event atlet sendiri via RLS payments_athlete_read. */
export default async function PembayaranSayaPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["athlete", "parent"].includes((profile.role as string) ?? "")) redirect("/keuangan");

  const supabase = createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name").limit(1).maybeSingle();

  const { data: payments } = await supabase
    .from("event_payments")
    .select("id, payment_status, total_amount, amount_paid, remaining_amount, paid_at, created_at, event_registrations(events(name, event_date))")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = payments ?? [];
  const totalTagihan = rows.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const totalDibayar = rows.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const totalSisa = rows.reduce((s, p) => s + Number(p.remaining_amount || 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Pembayaran Saya</h1>
        <p className="text-sm text-slate-500">{athlete?.full_name ?? ""}</p>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="card"><dt className="text-xs text-slate-500">Total Tagihan</dt><dd className="mt-1 text-lg font-bold">{rupiah(totalTagihan)}</dd></div>
        <div className="card"><dt className="text-xs text-slate-500">Sudah Dibayar</dt><dd className="mt-1 text-lg font-bold text-emerald-700">{rupiah(totalDibayar)}</dd></div>
        <div className="card"><dt className="text-xs text-slate-500">Sisa</dt><dd className="mt-1 text-lg font-bold text-red-700">{rupiah(totalSisa)}</dd></div>
      </dl>

      <div className="card">
        {(rows).length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada tagihan.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((p) => {
              const reg = Array.isArray(p.event_registrations) ? p.event_registrations[0] : p.event_registrations;
              const ev = reg?.events as { name?: string; event_date?: string } | null;
              return (
                <li key={p.id} className="space-y-1 py-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{ev?.name ?? "Event"}</span>
                    <span className={`badge ${p.payment_status === "VERIFIED" ? "bg-emerald-100 text-emerald-700" : p.payment_status === "MENUNGGU_VERIFIKASI" ? "bg-amber-100 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {p.payment_status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{ev?.event_date ?? "—"} · Tagihan {rupiah(Number(p.total_amount || 0))} · Dibayar {rupiah(Number(p.amount_paid || 0))} · Sisa {rupiah(Number(p.remaining_amount || 0))}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function rupiah(n: number): string {
  return `Rp${n.toLocaleString("id-ID")}`;
}
