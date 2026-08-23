"use client";

/**
 * EventPicker — pemilih event reusable untuk export & konfigurasi sync.
 * Mengambil daftar event langsung dari database (bukan hardcode).
 */
import { useEffect, useState } from "react";

export interface PickerEvent {
  id: string;
  name: string;
  event_date: string | null;
  status: string;
  registrations: number;
}

interface Props {
  onPick: (ev: PickerEvent) => void;
  /** Label tombol pilih per baris. */
  pickLabel?: string;
  /** Dipanggil setelah memilih; parent menutup modal sendiri. */
  title?: string;
}

export default function EventPicker({ onPick, pickLabel = "Pilih", title = "Pilih Event" }: Props) {
  const [events, setEvents] = useState<PickerEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/events/options");
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error || "Gagal memuat event");
        setEvents(json.events ?? []);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Gagal memuat event");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (err) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>;
  if (events === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-navy-800" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-navy-600">
        <p className="font-medium">Belum ada event.</p>
        <p className="mt-1 text-xs">Buat event terlebih dahulu di halaman Events.</p>
      </div>
    );
  }

  return (
    <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1" role="listbox" aria-label={title}>
      {events.map((ev) => (
        <li key={ev.id}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onPick(ev)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 dark:hover:bg-navy-800"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{ev.name}</span>
              <span className="block text-xs text-slate-500">
                {ev.event_date ?? "—"} · {ev.registrations} pendaftar
              </span>
            </span>
            <StatusBadge status={ev.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

const STATUS_CLS: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  CLOSED: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  ARCHIVED: "bg-slate-200 text-slate-700 dark:bg-navy-700 dark:text-slate-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.ARCHIVED}`}>
      {status}
    </span>
  );
}
