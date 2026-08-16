export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Konfigurasi aplikasi</p>
      </div>

      <div className="card space-y-3 text-sm">
        <h2 className="font-semibold">Informasi Klub</h2>
        <dl className="space-y-1.5">
          <div className="flex justify-between"><dt className="text-slate-500">Nama</dt><dd className="font-medium">TEAM CAKRA SWIMMING CLUB</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Aplikasi</dt><dd className="font-medium">ABSENSI TEAM CAKRA SWIMMING</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Versi</dt><dd className="font-medium">0.1.0</dd></div>
        </dl>
      </div>

      <div className="card space-y-3 text-sm">
        <h2 className="font-semibold">Integrasi Hermes / WhatsApp (Roadmap)</h2>
        <p className="text-slate-600">
          Arsitektur integrasi: WhatsApp → Hermes → Team Cakra API → Supabase.
          Endpoint API tersedia di <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/api/hermes</code> dengan autentikasi token
          (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">HERMES_API_TOKEN</code>).
        </p>
        <p className="text-slate-500">
          Hermes tidak memiliki akses database langsung; semua perubahan penting memerlukan konfirmasi.
        </p>
      </div>

      <div className="card space-y-2 text-sm">
        <h2 className="font-semibold">Keamanan</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>Autentikasi via Supabase Auth (email + password).</li>
          <li>Row Level Security aktif di semua tabel.</li>
          <li>Service role key hanya dipakai di server — tidak pernah ke browser.</li>
          <li>Semua aksi penting dicatat di audit logs.</li>
        </ul>
      </div>
    </div>
  );
}
