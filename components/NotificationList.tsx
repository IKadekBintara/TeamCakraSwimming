"use client";

import { useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  title: string;
  message: string;
  ntype: string;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_COLORS: Record<string, string> = {
  PAYMENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  EVENT: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  REGISTRATION: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  ACCOUNT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  ATTENDANCE: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  PERFORMANCE: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  SYSTEM: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function NotificationList({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busy, setBusy] = useState(false);

  async function markRead(id: string, go?: string | null) {
    setBusy(true);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    setBusy(false);
    if (go && go !== "/notifications") window.location.href = go;
  }

  async function markAll() {
    setBusy(true);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    setBusy(false);
  }

  if (items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-medium">Tidak ada notifikasi</p>
        <p className="mt-1 text-sm text-slate-500">Semua pemberitahuan akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <span className="text-sm font-semibold">{items.filter((i) => !i.is_read).length} belum dibaca</span>
        <button onClick={markAll} disabled={busy} className="text-xs text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-300">
          Tandai semua dibaca
        </button>
      </div>
      <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
        {items.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => markRead(n.id, n.link_path)}
              disabled={busy}
              className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 ${!n.is_read ? "bg-brand-50/50 dark:bg-brand-900/10" : ""}`}
            >
              <span className="flex items-center gap-2">
                <span className={`badge !px-2 !text-[10px] ${TYPE_COLORS[n.ntype] ?? TYPE_COLORS.SYSTEM}`}>{n.ntype}</span>
                <span className="text-sm font-semibold">{n.title}</span>
                {!n.is_read && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="belum dibaca" />}
                <span className="ml-auto whitespace-nowrap text-xs text-slate-400">{timeAgo(n.created_at)}</span>
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">{n.message}</span>
              {n.link_path && n.link_path !== "/notifications" && (
                <Link href={n.link_path} className="text-xs text-brand-700 hover:underline dark:text-brand-300">
                  Buka halaman terkait →
                </Link>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
