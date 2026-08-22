"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rupiah } from "@/lib/events";

export default function PaymentVerification({ payments }: { payments: Array<{ id: string; transaction_id: string; athlete_name: string; cakra: string | null; total_amount: number; amount_paid: number; payment_proof: string | null; payment_method: string | null; payment_status: string; event?: { name?: string } | null }> }) {
  const router = useRouter(); const supabase = createClient(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  async function verify(payment: typeof payments[number], mode: "LUNAS" | "DP" | "DITOLAK") {
    const label = mode === "DITOLAK" ? "Tolak bukti pembayaran ini?" : `Verifikasi pembayaran ${rupiah(payment.amount_paid)} sebagai ${mode}?`;
    if (!window.confirm(label)) return;
    setBusy(payment.id); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sesi login berakhir."); setBusy(null); return; }
    const paid = Number(payment.amount_paid || 0); const total = Number(payment.total_amount || 0);
    const payload = mode === "DITOLAK" ? { payment_status: "DITOLAK", verified_by: user.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { payment_status: mode === "LUNAS" || paid >= total ? "LUNAS" : "DP", amount_paid: paid, remaining_amount: Math.max(total - paid, 0), verified_by: user.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from("event_payments").update(payload).eq("id", payment.id);
    if (updateError) setError(updateError.message); else { await supabase.from("audit_logs").insert({ actor_id: user.id, action: mode === "DITOLAK" ? "reject_payment" : "verify_payment", entity: "event_payments", entity_id: payment.id, new_value: payload }); router.refresh(); }
    setBusy(null);
  }
  return <div className="space-y-3">{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{payments.map((p) => <div key={p.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{p.athlete_name}</p><p className="text-sm text-slate-500">{p.cakra || "Tanpa cakra"} · {p.transaction_id}</p><p className="mt-1 text-sm">{p.event?.name || "Event"}</p></div><div className="text-right"><p className="font-semibold">{rupiah(p.amount_paid)} / {rupiah(p.total_amount)}</p><p className="text-xs text-slate-500">{p.payment_method || "Metode belum dicatat"}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{p.payment_proof && <a href={p.payment_proof} target="_blank" rel="noreferrer" className="btn-secondary text-sm">Lihat Bukti</a>}<button disabled={busy === p.id} onClick={() => verify(p, "LUNAS")} className="btn-primary text-sm">✓ Verifikasi</button><button disabled={busy === p.id} onClick={() => verify(p, "DP")} className="btn-secondary text-sm">Verifikasi DP</button><button disabled={busy === p.id} onClick={() => verify(p, "DITOLAK")} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">✕ Tolak</button></div></div>)}{payments.length === 0 && <p className="text-sm text-slate-500">Tidak ada pembayaran menunggu verifikasi.</p>}</div>;
}
