import ImportAthletes from "@/components/ImportAthletes";
import ExportButtons from "@/components/ExportButtons";

export const dynamic = "force-dynamic";

export default function ImportExportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Import / Export</h1>
        <p className="text-sm text-slate-500">
          Excel bukan database utama — semua data tersimpan di Supabase.
        </p>
      </div>

      <ImportAthletes />

      <div className="card space-y-3">
        <h2 className="font-semibold">Export Excel</h2>
        <p className="text-sm text-slate-500">
          Unduh data atlet, kelompok, jadwal, dan absensi dalam format XLSX.
        </p>
        <ExportButtons from={monthStart} to={today} />
      </div>
    </div>
  );
}
