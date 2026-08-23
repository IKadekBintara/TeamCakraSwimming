"use client";

/**
 * ExportButtons — tombol export universal berbasis event.
 * "Dolphin" hanya nama event yang dipilih, bukan logika hardcoded.
 */
import { useState } from "react";
import EventPicker, { type PickerEvent } from "@/components/EventPicker";

type PickerMode = "event_registrations" | "event_finance";

const PICKER_TITLES: Record<PickerMode, { title: string; button: string; done: (name: string) => string }> = {
  event_registrations: {
    title: "Pilih Event — Data Pendaftaran",
    button: "Export Data Pendaftaran",
    done: (name) => `Data pendaftaran ${name} berhasil diekspor.`,
  },
  event_finance: {
    title: "Pilih Event — Keuangan",
    button: "Export Keuangan Event",
    done: (name) => `Keuangan ${name} berhasil diekspor.`,
  },
};

export default function ExportButtons({ from, to }: { from: string; to: string }) {
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [picked, setPicked] = useState<PickerEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function go(kind: string) {
    window.open(`/api/export?kind=${kind}&from=${from}&to=${to}`, "_blank");
  }

  async function exportEvent() {
    if (!picked) return;
    window.open(`/api/export?kind=${picker}&event_id=${picked.id}&from=${from}&to=${to}`, "_blank");
    setToast(PICKER_TITLES[picker!].done(picked.name));
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => go("attendance")} className="btn-secondary text-sm">
        ⬇ Absensi
      </button>
      <button type="button" onClick={() => go("athletes")} className="btn-secondary text-sm">
        ⬇ Atlet (Semua)
      </button>
      <button type="button" onClick={() => go("athletes_active")} className="btn-secondary text-sm">
        ⬇ Atlet Aktif
      </button>
      <button type="button" onClick={() => go("athletes_left")} className="btn-secondary text-sm">
        ⬇ Atlet Keluar
      </button>
      <button type="button" onClick={() => go("groups")} className="btn-secondary text-sm">
        ⬇ Kelompok & Jadwal
      </button>
      <button type="button" onClick={() => setPicker("event_registrations")} className="btn-secondary text-sm">
        ⬇ Data Pendaftaran Event
      </button>
      <button type="button" onClick={() => setPicker("event_finance")} className="btn-secondary text-sm">
        ⬇ Keuangan Event
      </button>

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={PICKER_TITLES[picker].title} onClick={() => setPicker(null)}>
          <div className="card w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold">{PICKER_TITLES[picker].title}</h3>
              <p className="text-xs text-slate-500">Semua status event dapat diekspor untuk laporan.</p>
            </div>

            {!picked ? (
              <EventPicker
                title={PICKER_TITLES[picker].title}
                pickLabel="Pilih"
                onPick={(ev) => setPicked(ev)}
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-navy-800/60">
                  <p className="font-semibold">{picked.name}</p>
                  <p className="text-xs text-slate-500">
                    {picked.event_date ?? "—"} · {picked.status} · {picked.registrations} pendaftar
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-sm" onClick={() => setPicked(null)}>
                    ← Ganti Event
                  </button>
                  <button type="button" className="btn-primary text-sm" onClick={exportEvent}>
                    {PICKER_TITLES[picker].button}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => { setPicker(null); setPicked(null); }}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
