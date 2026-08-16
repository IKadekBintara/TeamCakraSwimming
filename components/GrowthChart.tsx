"use client";

import { useMemo, useState } from "react";

export interface GrowthPoint {
  label: string; // mis. "Jan", "Feb"
  active: number;
  joined: number;
  left: number;
}

const RANGES = [
  { key: "7d", label: "7 Hari", days: 7 },
  { key: "30d", label: "30 Hari", days: 30 },
  { key: "3m", label: "3 Bulan", days: 92 },
  { key: "6m", label: "6 Bulan", days: 183 },
  { key: "1y", label: "1 Tahun", days: 365 },
  { key: "all", label: "Semua", days: 3650 },
] as const;

export default function GrowthChart({
  data,
  byRange,
}: {
  data: GrowthPoint[];
  byRange: Record<string, GrowthPoint[]>;
}) {
  const [range, setRange] = useState<string>("6m");
  const points = byRange[range] ?? data;

  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.active)),
    [points]
  );

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Pertumbuhan Atlet Aktif</h2>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Belum ada data.</p>
      ) : (
        <div className="flex h-44 items-end gap-1.5">
          {points.map((p, i) => (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
              <div className="absolute -top-1 hidden rounded bg-slate-800 px-2 py-1 text-[10px] text-white group-hover:block">
                {p.label}: {p.active} aktif (+{p.joined}/−{p.left})
              </div>
              <div
                className="w-full rounded-t-md bg-brand-500/80 transition-all hover:bg-brand-600"
                style={{ height: `${Math.max(4, (p.active / max) * 160)}px` }}
              />
              <span className="mt-1 w-full truncate text-center text-[9px] text-slate-400">
                {p.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
