"use client";

export default function ExportButtons({ from, to }: { from: string; to: string }) {
  function go(kind: string) {
    window.open(`/api/export?kind=${kind}&from=${from}&to=${to}`, "_blank");
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
      <button type="button" onClick={() => go("event_registrations")} className="btn-secondary text-sm">
        ⬇ Data Pendaftaran Dolphin
      </button>
      <button type="button" onClick={() => go("event_finance")} className="btn-secondary text-sm">
        ⬇ Keuangan Dolphin
      </button>
    </div>
  );
}
