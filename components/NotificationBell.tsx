"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

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

/** Lonceng notifikasi dengan badge unread + dropdown ringkas. Subtle, tidak mengganggu. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.items ?? []);
      setUnread((json.items ?? []).filter((i: Item) => !i.is_read).length);
    } catch {
      // senyap: bell tidak boleh mengganggu UI
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function markRead(id: string, go?: string | null) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    setOpen(false);
    if (go) router.push(go);
  }

  async function markAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    setUnread(0);
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : "Notifikasi"}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Bell size={18} aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <span className="text-sm font-semibold">Notifikasi</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-700 hover:underline dark:text-brand-300">
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Belum ada notifikasi</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id, n.link_path)}
                className={`flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/60 ${!n.is_read ? "bg-brand-50/60 dark:bg-brand-900/10" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`badge !px-1.5 !py-0 !text-[10px] ${TYPE_COLORS[n.ntype] ?? TYPE_COLORS.SYSTEM}`}>{n.ntype}</span>
                  {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-label="belum dibaca" />}
                </span>
                <span className="text-sm font-medium leading-tight">{n.title}</span>
                <span className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.message}</span>
              </button>
            ))}
          </div>
          <a href="/notifications" className="block border-t border-slate-100 py-2 text-center text-xs font-medium text-brand-700 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-300 dark:hover:bg-slate-800">
            Lihat semua notifikasi
          </a>
        </div>
      )}
    </div>
  );
}
