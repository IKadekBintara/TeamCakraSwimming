"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rupiah } from "@/lib/events";

export default function PaymentVerification({ payments }: { payments: Array<{ id: string; transaction_id: string; athlete_name: string; cakra: string | null; jumlah_nomor: number | null; registration_fee: number | null; admin_fee: number | null; total_amount: number; amount_paid: number; remaining_amount: number | null; payment_proof: string | null; payment_method: string | null; payment_status: string; notes: string | null; event?: { name?: string } | null }> }) {
  const router = useRouter(); const supabase = createClient(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  async function verify(payment: typeof payments[number], mode: "LUNAS" | "DP" | "DITOLAK") {
    const label = mode === "DITOLAK" ? "Tolak bukti pembayaran ini?" : `Verifikasi pembayaran ${rupiah(payment.amount_paid)} sebagai ${mode}?`;
    if (!window.confirm(label)) return;
    setBusy(payment.id); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sesi login berakhir. Muat ulang halaman untuk masuk kembali."); setBusy(null); return; }
    const paid = Number(payment.amount_paid || 0); const total = Number(payment.total_amount || 0);
    const note = (noteDraft[payment.id] ?? "").trim();
    const payload: Record<string, unknown> = mode === "DITOLAK"
      ? { payment_status: "DITOLAK", verified_by: user.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { payment_status: mode === "LUNAS" || paid >= total ? "LUNAS" : "DP", amount_paid: paid, remaining_amount: Math.max(total - paid, 0), verified_by: user.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (note) payload.notes = note;
    const { error: updateError } = await supabase.from("event_payments").update(payload).eq("id", payment.id);
    if (updateError) setError(updateError.message); else { await supabase.from("audit_logs").insert({ actor_id: user.id, action: mode === "DITOLAK" ? "reject_payment" : "verify_payment", entity: "event_payments", entity_id: payment.id, new_value: { status: payload.payment_status, notes: note || null } }); router.refresh(); }
    setBusy(null);
  }
  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {payments.map((p) => (
        <div key={p.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{p.athlete_name}</p>
              <p className="text-sm text-slate-500">{p.cakra || "Tanpa cakra"} · {p.transaction_id}</p>
              <p className="mt-1 text-sm">{p.event?.name || "Event"}</p>
              {p.jumlah_nomor != null && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {p.jumlah_nomor} nomor × {rupiah(p.registration_fee)} + admin {rupiah(p.admin_fee)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold">{rupiah(p.amount_paid)} / {rupiah(p.total_amount)}</p>
              <p className="text-xs text-slate-500">{p.payment_method || "Metode belum dicatat"}</p>
              {p.notes && <p className="mt-1 max-w-[240px] text-xs italic text-slate-400">“{p.notes}”</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {p.payment_proof && <a href={p.payment_proof} target="_blank" rel="noreferrer" className="btn-secondary text-sm">Lihat Bukti</a>}
            <input
              className="input h-9 max-w-xs flex-1 text-xs"
              placeholder="Tambah catatan (opsional)…"
              value={noteDraft[p.id] ?? ""}
              onChange={(e) => setNoteDraft({ ...noteDraft, [p.id]: e.target.value })}
              aria-label={`Catatan untuk ${p.athlete_name}`}
            />
            <button disabled={busy === p.id} onClick={() => verify(p, "LUNAS")} className="btn-primary text-sm">✓ Verifikasi</button>
            <button disabled={busy === p.id} onClick={() => verify(p, "DP")} className="btn-secondary text-sm">Verifikasi DP</button>
            <button disabled={busy === p.id} onClick={() => verify(p, "DITOLAK")} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">✕ Tolak</button>
          </div>
        </div>
      ))}
      {payments.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">Tidak ada pembayaran menunggu verifikasi.</p>
          <p className="empty-state-desc">Semua bukti transfer sudah diproses.</p>
        </div>
      )}
    </div>
  );
}
