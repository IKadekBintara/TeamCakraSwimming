"use client";

import { useState } from "react";

type Setting = { id: string; enabled: boolean; offsets_hours: number[] };

const LABELS: Record<string, string> = {
  payment_reminder: "Pengingat Pembayaran",
  event_deadline_reminder: "Pengingat Deadline Event",
};

export default function AutomationSettingsForm({ initial }: { initial: Setting[] }) {
  const [rows, setRows] = useState<Setting[]>(initial);
  const [offsetsText, setOffsetsText] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((s) => [s.id, s.offsets_hours.join(", ")]))
  );
  const [msg, setMsg] = useState("");

  async function save(s: Setting, patch: Partial<Setting>) {
    const next = { ...s, ...patch };
    setMsg("Menyimpan…");
    const res = await fetch("/api/communication/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, enabled: next.enabled, offsets_hours: next.offsets_hours }),
    });
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === s.id ? next : r)));
      setMsg("Tersimpan.");
      setTimeout(() => setMsg(""), 2000);
    } else {
      const j = await res.json().catch(() => null);
      setMsg(j?.error ?? "Gagal menyimpan");
      // rollback tampilan toggle
      setRows((prev) => [...prev]);
    }
  }

  function commitOffsets(s: Setting) {
    const parts = (offsetsText[s.id] ?? "")
      .split(/[,\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 720);
    if (parts.length === 0) {
      setOffsetsText((p) => ({ ...p, [s.id]: s.offsets_hours.join(", ") }));
      return;
    }
    save(s, { offsets_hours: Array.from(new Set(parts)).sort((a, b) => a - b) });
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="card-title">Automation Rules</h2>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
      <div className="space-y-4">
        {rows.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{LABELS[s.id] ?? s.id}</span>
              <span className="flex items-center gap-2">
                <span className={`badge ${s.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                  {s.enabled ? "ON" : "OFF"}
                </span>
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => save(s, { enabled: e.target.checked })}
                  className="h-4 w-4"
                  aria-label={`Aktifkan ${LABELS[s.id] ?? s.id}`}
                />
              </span>
            </label>
            <label className="mt-2 block">
              <span className="text-xs text-slate-500">
                Interval notifikasi{LABELS[s.id] === "Pengingat Pembayaran" ? " (jam sejak pendaftaran)" : " (jam sebelum deadline)"}
              </span>
              <input
                className="input mt-1"
                value={offsetsText[s.id] ?? ""}
                onChange={(e) => setOffsetsText((p) => ({ ...p, [s.id]: e.target.value }))}
                onBlur={() => commitOffsets(s)}
                placeholder={LABELS[s.id] === "Pengingat Pembayaran" ? "24, 48, 72" : "168, 72, 24"}
              />
            </label>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">Belum ada automation rule.</p>}
      </div>
    </div>
  );
}
