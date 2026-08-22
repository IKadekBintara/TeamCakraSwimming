import { createClient } from "@/lib/supabase/server";
import PaymentSettingsForm from "@/components/PaymentSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: settings } = await supabase.from("payment_settings").select("bank_name,account_number,account_name,ewallet_name,ewallet_number,instructions").eq("id", true).maybeSingle();
  return <div className="mx-auto max-w-2xl space-y-5 pt-14 lg:pt-0">
    <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-slate-500">Konfigurasi aplikasi dan pembayaran event.</p></div>
    <PaymentSettingsForm initial={settings} />
    <div className="card space-y-3 text-sm"><h2 className="font-semibold">Informasi Klub</h2><dl className="space-y-1.5"><div className="flex justify-between"><dt className="text-slate-500">Nama</dt><dd className="font-medium">TEAM CAKRA SWIMMING CLUB</dd></div><div className="flex justify-between"><dt className="text-slate-500">Aplikasi</dt><dd className="font-medium">TEAM CAKRA SWIMMING MANAGEMENT SYSTEM</dd></div><div className="flex justify-between"><dt className="text-slate-500">Versi</dt><dd className="font-medium">0.1.0</dd></div></dl></div>
    <div className="card space-y-3 text-sm"><h2 className="font-semibold">Integrasi Hermes / WhatsApp (Roadmap)</h2><p className="text-slate-600">Arsitektur integrasi: WhatsApp → Hermes → Team Cakra API → Supabase. Hermes tidak boleh memverifikasi pembayaran otomatis.</p></div>
    <div className="card space-y-2 text-sm"><h2 className="font-semibold">Keamanan</h2><ul className="list-disc space-y-1 pl-5 text-slate-600"><li>Autentikasi via Supabase Auth.</li><li>Row Level Security aktif di tabel event dan payment.</li><li>Service role key hanya dipakai di server.</li><li>Verifikasi pembayaran hanya dilakukan admin.</li></ul></div>
  </div>;
}
