"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PaymentProofForm({ paymentId, currentAmount, totalAmount, status }: { paymentId: string; currentAmount: number; totalAmount: number; status: string }) {
  const supabase = createClient(); const router = useRouter(); const [file, setFile] = useState<File | null>(null); const [amount, setAmount] = useState(String(currentAmount || totalAmount || 0)); const [method, setMethod] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  if (["LUNAS", "DP"].includes(status)) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    if (!file) { setError("Pilih bukti pembayaran."); setSaving(false); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Ukuran bukti maksimal 5 MB."); setSaving(false); return; }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") { setError("Bukti harus berupa gambar atau PDF."); setSaving(false); return; }
    const path = `${paymentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) { setError(uploadError.message); setSaving(false); return; }
    const { data: urlData } = supabase.storage.from("payment-proofs").getPublicUrl(path);
    const { error: updateError } = await supabase.from("event_payments").update({ amount_paid: Number(amount), remaining_amount: Math.max(Number(totalAmount) - Number(amount), 0), payment_method: method || null, payment_proof: urlData.publicUrl, payment_status: "MENUNGGU_VERIFIKASI", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", paymentId);
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    router.refresh(); setSaving(false);
  }
  return <form onSubmit={submit} className="mt-3 rounded-lg bg-slate-50 p-3"><p className="mb-2 text-sm font-medium">Kirim Bukti Pembayaran</p><div className="grid gap-2 sm:grid-cols-3"><input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Nominal" /><input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Transfer Bank / E-wallet" /><input className="input" required type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>{error && <p className="mt-2 text-xs text-red-700">{error}</p>}<button disabled={saving} className="btn-primary mt-2 text-sm">{saving ? "Mengirim..." : "Kirim Bukti"}</button></form>;
}
