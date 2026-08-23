"use client";

import { useState } from "react";

type Delivery = {
  id: string;
  recipient_id: string;
  channel: string;
  template_key: string | null;
  status: string;
  attempts: number;
  error: string | null;
  last_attempt_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  QUEUED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export default function FailedDeliveries({ failed, recent }: { failed: Delivery[]; recent: Delivery[] }) {
  const [rows, setRows] = useState(recent);
  const [msg, setMsg] = useState("");

  async function retry(id: string) {
    setMsg("Mencoba ulang…");
    const res = await fetch("/api/communication/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json().catch(() => null);
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, attempts: j?.attempts ?? r.attempts + 1 } : r)));
      setMsg("Retry dicatat (provider belum dikonfigurasi — tetap FAILED).");
    } else {
      setMsg(j?.error ?? "Gagal retry");
    }
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="card-title">Delivery Logs</h2>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>

      {failed.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-red-600 dark:text-red-400">Gagal dikirim ({failed.length})</p>
          <div className="overflow-x-auto">
            <table className="table !min-w-[640px]">
              <thead><tr><th>Penerima</th><th>Channel</th><th>Template</th><th>Error</th><th>Attempt</th><th>Terakhir</th><th>Aksi</th></tr></thead>
              <tbody>
                {failed.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-xs">{d.recipient_id.slice(0, 8)}…</td>
                    <td>{d.channel}</td>
                    <td className="font-mono text-xs">{d.template_key ?? "—"}</td>
                    <td className="max-w-[200px] truncate text-xs text-slate-500">{d.error ?? "—"}</td>
                    <td>{d.attempts}/3</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{new Date(d.last_attempt_at).toLocaleString("id-ID")}</td>
                    <td>
                      {d.attempts < 3 ? (
                        <button onClick={() => retry(d.id)} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Retry</button>
                      ) : (
                        <span className="text-xs text-slate-400">habis</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table !min-w-[560px]">
          <thead><tr><th>Status</th><th>Channel</th><th>Template</th><th>Attempt</th><th>Waktu</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td><span className={`badge !px-2 !text-[10px] ${STATUS_BADGE[d.status] ?? ""}`}>{d.status}</span></td>
                <td>{d.channel}</td>
                <td className="font-mono text-xs">{d.template_key ?? "—"}</td>
                <td>{d.attempts}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{new Date(d.last_attempt_at).toLocaleString("id-ID")}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">Belum ada pengiriman email/WA.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Hanya in-app yang benar-benar terkirim saat ini. Status SENT untuk email/WA baru akan muncul setelah provider dikonfigurasi.
      </p>
    </div>
  );
}
