"use client";

/**
 * Tabel Pendaftaran Event yang dapat dikelola Admin.
 * - Semua data dari props (server-rendered, sumber = database).
 * - Mutasi via PATCH /api/admin/event-payments -> router.refresh() (data baru dari DB).
 * - Non-admin: tampilan read-only murni.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rupiah, paymentStatusLabel, type PaymentStatus } from "@/lib/events";

export type PayRow = {
  id: string;
  athlete: string;
  athleteId: string;
  ku: string;
  entries: string;
  regStatus: string;
  pay: {
    id: string;
    status: string;
    total: number;
    eventFee?: number;
    adminFee?: number;
    paid: number;
    method: string | null;
    proof: string | null;
  } | null;
};

const FINAL_OK: PaymentStatus[] = ["BELUM_BAYAR", "MENUNGGU_VERIFIKASI", "DP", "LUNAS", "DITOLAK"];

function badgeClass(status: string) {
  switch (status) {
    case "LUNAS": return "bg-emerald-100 text-emerald-700";
    case "BELUM_BAYAR": return "bg-slate-100 text-slate-700";
    case "MENUNGGU_VERIFIKASI": return "bg-amber-100 text-amber-700";
    case "DP": return "bg-blue-100 text-blue-700";
    case "DITOLAK": return "bg-red-100 text-red-700";
    default: return "bg-slate-200 text-slate-500";
  }
}

type ModalState =
  | { mode: "detail"; row: PayRow }
  | { mode: "confirm"; row: PayRow; action: "verify" | "reject" }
  | { mode: "manage"; row: PayRow }
  | null;

export default function EventPaymentsManager({ rows, eventName, eventId, canManage }: {
  rows: PayRow[];
  eventName: string;
  eventId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ status: "BELUM_BAYAR", paid: "", method: "", notes: "" });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function mutate(payload: Record<string, unknown>, successMsg: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/event-payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal memperbarui pembayaran. Data mungkin sudah berubah, silakan muat ulang dan coba lagi.");
        return false;
      }
      setToast(successMsg);
      setModal(null);
      router.refresh();
      return true;
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openManage(row: PayRow) {
    const st = row.pay?.status ?? "BELUM_BAYAR";
    setForm({
      status: FINAL_OK.includes(st as PaymentStatus) ? st : "BELUM_BAYAR",
      paid: String(row.pay?.paid ?? ""),
      method: row.pay?.method ?? "",
      notes: "",
    });
    setModal({ mode: "manage", row });
  }

  function doAction(row: PayRow, action: "verify" | "reject") {
    if (!row.pay) return;
    return mutate(
      { payment_id: row.pay.id, action, expected_status: row.pay.status },
      action === "verify" ? "Pembayaran berhasil diverifikasi." : "Bukti pembayaran ditolak."
    );
  }

  function submitManage(row: PayRow) {
    if (!row.pay) return;
    const payload: Record<string, unknown> = {
      payment_id: row.pay.id,
      action: "set_status",
      payment_status: form.status,
      expected_status: row.pay.status,
    };
    if (form.paid !== "") payload.amount_paid = Number(form.paid);
    if (form.method.trim()) payload.payment_method = form.method.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();
    return mutate(payload, `Status pembayaran ${row.athlete} diperbarui ke ${paymentStatusLabel(form.status as PaymentStatus)}.`);
  }

  function cancelRegistration(row: PayRow) {
    if (!row.pay) return;
    if (!window.confirm(`Batalkan seluruh pendaftaran ${row.athlete} untuk ${eventName}? Status pembayaran menjadi CANCELLED.`)) return;
    void mutate({ payment_id: row.pay.id, action: "cancel", expected_status: row.pay.status }, `Pendaftaran ${row.athlete} dibatalkan.`);
  }

  const actionsCell = (row: PayRow) => {
    if (!canManage) return <span className="text-xs text-slate-400">—</span>;
    if (!row.pay) return <span className="text-xs text-slate-400">Tidak ada tagihan</span>;
    if (row.regStatus === "CANCELLED" || row.pay.status === "CANCELLED")
      return <button className="btn-secondary text-xs" onClick={() => setModal({ mode: "detail", row })}>Detail</button>;
    const st = row.pay.status;
    return (
      <div className="flex flex-wrap gap-1.5">
        {(st === "BELUM_BAYAR" || st === "DP") && (
          <button disabled={busy} className="btn-primary text-xs" onClick={() => setModal({ mode: "confirm", row, action: "verify" })}>✓ Tandai Lunas</button>
        )}
        {st === "MENUNGGU_VERIFIKASI" && (
          <>
            <button disabled={busy} className="btn-primary text-xs" onClick={() => setModal({ mode: "confirm", row, action: "verify" })}>✓ Verifikasi</button>
            <button disabled={busy} className="btn-secondary text-xs" onClick={() => setModal({ mode: "confirm", row, action: "reject" })}>✕ Tolak</button>
          </>
        )}
        <button className="btn-secondary text-xs" onClick={() => openManage(row)}>Kelola</button>
        {st !== "CANCELLED" && row.regStatus !== "CANCELLED" && <button className="text-xs text-red-600 hover:underline" onClick={() => cancelRegistration(row)}>Batalkan</button>}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pendaftaran Event</h2>
        <Link href={`/registrations?event=${eventId}`} className="text-sm text-brand-700 hover:underline">Lihat Keuangan →</Link>
      </div>

      {/* Desktop: tabel */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-2">Atlet</th><th className="px-2 py-2">KU</th><th className="px-2 py-2">Nomor</th>
            <th className="px-2 py-2">Pembayaran</th><th className="px-2 py-2">Uang Event / Admin / Total</th><th className="px-2 py-2">Aksi</th>
          </tr></thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2 font-medium">{r.athlete}</td>
                <td className="px-2 py-2">{r.ku}</td>
                <td className="px-2 py-2">{r.entries || "—"}</td>
                <td className="px-2 py-2"><span className={`badge ${badgeClass(r.pay?.status ?? "")}`}>{r.pay ? paymentStatusLabel(r.pay.status as PaymentStatus) : "—"}</span>{r.pay?.method && <span className="ml-1 text-xs text-slate-400">{r.pay.method}</span>}</td>
                <td className="px-2 py-2 whitespace-nowrap">{r.pay ? (<span className="text-xs"><strong className="text-brand-700">{rupiah(r.pay.eventFee ?? 0)}</strong><span className="text-slate-400"> / {rupiah(r.pay.adminFee ?? 0)} / </span><strong>{rupiah(r.pay.total)}</strong></span>) : "—"}</td>
                <td className="px-2 py-2">{actionsCell(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-medium">{r.athlete}</p>
            <p className="text-xs text-slate-500">KU {r.ku} · {r.entries || "—"}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={`badge ${badgeClass(r.pay?.status ?? "")}`}>{r.pay ? paymentStatusLabel(r.pay.status as PaymentStatus) : "—"}</span>
              <span className="text-right text-sm"><strong className="text-brand-700">{rupiah(r.pay?.eventFee ?? 0)}</strong><span className="text-xs text-slate-400"> / {rupiah(r.pay?.adminFee ?? 0)} / </span><strong>{rupiah(r.pay?.total ?? 0)}</strong></span>
            </div>
            <div className="mt-2">{actionsCell(r)}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 && <p className="text-sm text-slate-500">Belum ada pendaftaran.</p>}

      {/* ===== Modal ===== */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={() => !busy && setModal(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {modal.mode === "confirm" && (
              <>
                <h3 className="text-lg font-bold">Konfirmasi Pembayaran</h3>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Atlet</dt><dd className="font-medium">{modal.row.athlete}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Uang event</dt><dd>{rupiah(modal.row.pay!.eventFee ?? 0)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Uang admin</dt><dd>{rupiah(modal.row.pay!.adminFee ?? 0)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Total tagihan</dt><dd className="font-medium">{rupiah(modal.row.pay!.total)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Status sebelumnya</dt><dd>{paymentStatusLabel(modal.row.pay!.status as PaymentStatus)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Status baru</dt><dd className="font-semibold text-emerald-700">{modal.action === "verify" ? "Lunas" : "Ditolak"}</dd></div>
                </dl>
                {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-secondary" disabled={busy} onClick={() => setModal(null)}>Batal</button>
                  <button className="btn-primary" disabled={busy} onClick={() => doAction(modal.row, modal.action)}>
                    {busy ? "Memproses…" : modal.action === "verify" ? "Konfirmasi Lunas" : "Konfirmasi Tolak"}
                  </button>
                </div>
              </>
            )}

            {modal.mode === "detail" && modal.row.pay && (
              <>
                <h3 className="text-lg font-bold">Detail Pendaftaran</h3>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Atlet</dt><dd className="font-medium">{modal.row.athlete}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Event</dt><dd>{eventName}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">KU</dt><dd>{modal.row.ku}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Nomor lomba</dt><dd className="text-right">{modal.row.entries || "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Tagihan</dt><dd>{rupiah(modal.row.pay.total)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Status Pembayaran</dt><dd>{paymentStatusLabel(modal.row.pay.status as PaymentStatus)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Metode</dt><dd>{modal.row.pay.method || "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Bukti</dt><dd>{modal.row.pay.proof ? <a href={modal.row.pay.proof} target="_blank" rel="noreferrer" className="text-brand-700 underline">Lihat bukti</a> : "—"}</dd></div>
                </dl>
                {canManage && modal.row.regStatus !== "CANCELLED" && modal.row.pay.status !== "CANCELLED" && (
                  <div className="mt-4 flex justify-end gap-2">
                    <button className="btn-secondary" onClick={() => openManage(modal.row)}>Kelola</button>
                  </div>
                )}
                <div className="mt-4 flex justify-end"><button className="btn-secondary" onClick={() => setModal(null)}>Tutup</button></div>
              </>
            )}

            {modal.mode === "manage" && modal.row.pay && (
              <>
                <h3 className="text-lg font-bold">Kelola Pembayaran</h3>
                <p className="mt-1 text-sm text-slate-500">{modal.row.athlete} · Tagihan {rupiah(modal.row.pay.total)}</p>
                <div className="mt-4 space-y-3">
                  <label className="label block">Status Pembayaran
                    <select className="input mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      {FINAL_OK.map((s) => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
                    </select>
                  </label>
                  <label className="label block">Nominal Dibayar
                    <input className="input mt-1" type="number" min={0} max={modal.row.pay.total} value={form.paid}
                      onChange={(e) => setForm({ ...form, paid: e.target.value })}
                      placeholder={String(modal.row.pay.total)} />
                    <span className="mt-1 block text-xs text-slate-400">Kosongkan untuk mempertahankan nilai sekarang ({rupiah(modal.row.pay.paid)}).</span>
                  </label>
                  <label className="label block">Metode
                    <input className="input mt-1" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="Transfer Bank / Tunai / QRIS…" />
                  </label>
                  <label className="label block">Catatan (opsional)
                    <textarea className="input mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </label>
                </div>
                {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-secondary" disabled={busy} onClick={() => setModal(null)}>Batal</button>
                  <button className="btn-primary" disabled={busy} onClick={() => submitManage(modal.row)}>{busy ? "Menyimpan…" : "Simpan"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
