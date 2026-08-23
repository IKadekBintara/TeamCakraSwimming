"use client";

import { useEffect, useState } from "react";

type Prefs = { in_app_enabled: boolean; email_enabled: boolean; whatsapp_enabled: boolean };

/** Preferensi channel notifikasi. Email/WA belum terintegrasi — ditandai jujur di UI. */
export default function NotificationPrefsForm() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.prefs && setPrefs(j.prefs))
      .catch(() => {});
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    await fetch("/api/notifications/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next[key] }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!prefs) return null;

  return (
    <div className="card">
      <h2 className="card-title mb-3">Preferensi Notifikasi</h2>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Notifikasi dalam aplikasi</span>
            <span className="text-xs text-slate-500">Lonceng + halaman notifikasi</span>
          </span>
          <input type="checkbox" checked={prefs.in_app_enabled} onChange={() => toggle("in_app_enabled")} className="h-4 w-4" disabled={saving} />
        </label>
        <label className="flex items-center justify-between gap-4 opacity-70">
          <span>
            <span className="block text-sm font-medium">Email</span>
            <span className="text-xs text-slate-500">Email integration belum dikonfigurasi</span>
          </span>
          <input type="checkbox" checked={prefs.email_enabled} onChange={() => toggle("email_enabled")} className="h-4 w-4" disabled={saving} />
        </label>
        <label className="flex items-center justify-between gap-4 opacity-70">
          <span>
            <span className="block text-sm font-medium">WhatsApp</span>
            <span className="text-xs text-slate-500">WhatsApp integration belum dikonfigurasi</span>
          </span>
          <input type="checkbox" checked={prefs.whatsapp_enabled} onChange={() => toggle("whatsapp_enabled")} className="h-4 w-4" disabled={saving} />
        </label>
      </div>
      {saved && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Preferensi tersimpan.</p>}
    </div>
  );
}
