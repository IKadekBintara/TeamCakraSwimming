import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTime } from "@/lib/performance";
import AutomationSettingsForm from "@/components/AutomationSettingsForm";
import TemplateEditor from "@/components/TemplateEditor";
import ManualNotifyForm from "@/components/ManualNotifyForm";
import FailedDeliveries from "@/components/FailedDeliveries";

export const dynamic = "force-dynamic";

export default async function CommunicationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "operator"].includes(profile.role)) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">Akses ditolak</p>
        <p className="mt-1 text-sm text-slate-500">Halaman ini hanya untuk admin dan operator.</p>
      </div>
    );
  }

  const [{ data: templates }, { data: settings }, { data: deliveries }] = await Promise.all([
    supabase.from("notification_templates").select("*").order("channel").order("key"),
    supabase.from("automation_settings").select("*").order("id"),
    supabase.from("notification_deliveries").select("*").order("last_attempt_at", { ascending: false }).limit(50),
  ]);

  const failed = (deliveries ?? []).filter((d) => d.status === "FAILED");
  const sent = (deliveries ?? []).filter((d) => d.status === "SENT");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Communication Center</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Otomatisasi, template, dan log pengiriman notifikasi TEAM CAKRA SWIMMING.
        </p>
      </header>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-card"><p className="stat-label">Template</p><p className="stat-value">{templates?.length ?? 0}</p></div>
        <div className="stat-card"><p className="stat-label">Automation Aktif</p><p className="stat-value">{(settings ?? []).filter((s) => s.enabled).length}</p></div>
        <div className="stat-card"><p className="stat-label">Terkirim (50 terakhir)</p><p className="stat-value">{sent.length}</p></div>
        <div className="stat-card"><p className="stat-label">Gagal</p><p className="stat-value text-red-600 dark:text-red-400">{failed.length}</p></div>
      </div>

      {/* Status channel — jujur */}
      <div className="card border-l-4 border-l-amber-400">
        <p className="text-sm font-medium">Status channel pengiriman</p>
        <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>✅ <strong>In-app</strong> — aktif (lonceng + halaman notifikasi)</li>
          <li>⛔ <strong>Email</strong> — belum dikonfigurasi</li>
          <li>⛔ <strong>WhatsApp</strong> — belum dikonfigurasi</li>
        </ul>
      </div>

      {/* Automation settings */}
      <AutomationSettingsForm initial={(settings ?? []) as never[]} />

      {/* Templates */}
      <TemplateEditor initial={(templates ?? []) as never[]} />

      {/* Manual broadcast */}
      <ManualNotifyForm />

      {/* Delivery logs */}
      <FailedDeliveries failed={failed as never[]} recent={(deliveries ?? []) as never[]} />
    </div>
  );
}
