"use client";

/**
 * PermanentEventDelete — tombol + modal konfirmasi dua tahap.
 * Tahap 1: ringkasan dampak (nama, race, pendaftar) + warning permanen.
 * Tahap 2: ketik "HAPUS" untuk mengaktifkan tombol final.
 * Hanya admin; API memvalidasi ulang (bukan sekadar hide UI).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  eventId: string;
  eventName: string;
  canManage: boolean;
}

export default function PermanentEventDelete({ eventId, eventName, canManage }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<1 | 2>(1);
  const [info, setInfo] = useState<{ races: number; registrations: number } | null>(null);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function openModal() {
    setOpen(true); setStage(1); setWord(""); setErr(null); setInfo(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/permanent-delete`, { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat info event");
      setInfo({ races: json.races ?? 0, registrations: json.registrations ?? 0 });
    } catch {
      setInfo({ races: 0, registers: 0 } as never);
    }
  }

  async function doDelete() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/permanent-delete`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus");
      // Redirect ke /events dengan toast sukses (sesuai requirement).
      router.push("/events?deleted=1");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <>
      <button type="button" className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/40 sm:w-auto" onClick={openModal}>
        Hapus Event Permanen
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-lg space-y-4">
            {stage === 1 ? (
              <>
                <h3 className="font-semibold text-red-600">Hapus Event Permanen?</h3>
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm dark:bg-red-950/40">
                  <p><span className="font-semibold">{eventName}</span> akan dihapus <strong>PERMANEN</strong>.</p>
                  {info && (
                    <ul className="mt-2 list-disc pl-5">
                      <li>{info.races} nomor lomba (race)</li>
                      <li>{info.registrations} pendaftaran beserta entry &amp; pembayarannya</li>
                    </ul>
                  )}
                </div>
                <p className="text-sm text-slate-500">Atlet, akun user, absensi reguler, performance historis, dan data global lain TIDAK ikut terhapus. Tindakan ini tidak dapat dibatalkan.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>Batal</button>
                  <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={() => setStage(2)}>Lanjut</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-red-600">Konfirmasi Kedua</h3>
                <p className="text-sm">Ketik <span className="rounded bg-slate-100 px-1.5 font-mono font-bold dark:bg-navy-700">HAPUS</span> untuk mengaktifkan tombol penghapusan.</p>
                <input autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-navy-600 dark:bg-navy-900" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Ketik HAPUS" aria-label="Ketik HAPUS untuk konfirmasi" />
                {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>Batal</button>
                  <button type="button" disabled={word !== "HAPUS" || busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40" onClick={doDelete}>
                    {busy ? "Menghapus…" : "Hapus Permanen"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-5 right-5 z-[60] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
    </>
  );
}
