"use client";

import { useState } from "react";

type Template = {
  id: string;
  key: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: unknown;
  is_active: boolean;
};

const CHANNEL_BADGE: Record<string, string> = {
  in_app: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  email: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  whatsapp: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

/** Render pratinjau dengan contoh nilai variable (fallback aman untuk yang kosong). */
function preview(body: string): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, "‹$1›");
}

export default function TemplateEditor({ initial }: { initial: Template[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");

  function startEdit(t: Template) {
    setEditing(t.key);
    setDraft(t.body);
    setMsg("");
  }

  async function save(t: Template) {
    setMsg("Menyimpan…");
    const res = await fetch("/api/communication/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: t.key, body: draft }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((x) => (x.key === t.key ? { ...x, body: draft } : x)));
      setEditing(null);
      setMsg("Template tersimpan.");
    } else {
      const j = await res.json().catch(() => null);
      setMsg(j?.error ?? "Gagal menyimpan");
    }
    setTimeout(() => setMsg(""), 2500);
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="card-title">Notification Templates</h2>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table !min-w-[640px]">
          <thead>
            <tr><th>Key</th><th>Channel</th><th>Pratinjau</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.key}>
                <td className="whitespace-nowrap font-mono text-xs">{t.key}</td>
                <td><span className={`badge !px-2 !text-[10px] ${CHANNEL_BADGE[t.channel] ?? ""}`}>{t.channel}</span></td>
                <td className="max-w-[280px]">
                  {editing === t.key ? (
                    <div className="space-y-2">
                      <textarea
                        className="input min-h-[80px] font-mono text-xs"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        aria-label={`Edit template ${t.key}`}
                      />
                      <p className="text-[11px] text-slate-400">Pratinjau: {preview(draft).slice(0, 120)}</p>
                    </div>
                  ) : (
                    <span className="line-clamp-2 text-sm">{preview(t.body)}</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${t.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                    {t.is_active ? "aktif" : "nonaktif"}
                  </span>
                </td>
                <td>
                  {editing === t.key ? (
                    <span className="flex gap-2 whitespace-nowrap">
                      <button onClick={() => save(t)} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Simpan</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:underline">Batal</button>
                    </span>
                  ) : (
                    <button onClick={() => startEdit(t)} className="text-xs text-brand-700 hover:underline dark:text-brand-300">Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Variable seperti {"{{athlete_name}}"} diisi otomatis saat pengiriman; variable yang tidak tersedia dirender sebagai “(tidak tersedia)”.
      </p>
    </div>
  );
}
