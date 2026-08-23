"use client";

import { useMemo, useState } from "react";
import { formatTime, computePbs, comboKey, type PerfResult } from "@/lib/performance";

/**
 * Performance section pada profil atlet.
 * Semua angka dihitung dari data nyata; tanpa data -> empty state informatif.
 */
export default function AthletePerformance({ results }: { results: PerfResult[] }) {
  const [combo, setCombo] = useState<string | null>(null);

  const pbs = useMemo(() => computePbs(results), [results]);

  // Stroke overview
  const byStroke = useMemo(() => {
    const map = new Map<string, { pb: number | null; last: PerfResult | null; best: PerfResult | null; count: number }>();
    for (const r of results) {
      const cur = map.get(r.stroke) ?? { pb: null, last: null, best: null, count: 0 };
      cur.count += 1;
      if (!cur.last || r.recorded_at > cur.last.recorded_at) cur.last = r;
      if (r.time_cs != null && (cur.pb == null || r.time_cs < cur.pb)) cur.pb = r.time_cs;
      if (r.time_cs != null && (cur.best == null || (cur.best.time_cs ?? Infinity) > r.time_cs)) cur.best = r;
      map.set(r.stroke, cur);
    }
    return map;
  }, [results]);

  // Kombinasi tersedia untuk chart
  const combos = useMemo(() => {
    const keys = Array.from(new Set(results.filter((r) => r.time_cs != null).map(comboKey)));
    return keys.sort();
  }, [results]);

  const activeCombo = combo && combos.includes(combo) ? combo : combos[0] ?? null;

  const series = useMemo(() => {
    if (!activeCombo) return [];
    return results
      .filter((r) => comboKey(r) === activeCombo && r.time_cs != null)
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map((r) => ({ date: r.recorded_at, cs: r.time_cs as number }));
  }, [results, activeCombo]);

  // Perbandingan PB vs PB sebelumnya (semakin kecil semakin baik)
  const comparison = useMemo(() => {
    if (!activeCombo || series.length < 2) return null;
    const sorted = [...series].sort((a, b) => a.cs - b.cs);
    const currentPb = sorted[0];
    const previousPb = sorted[1];
    return { current: currentPb.cs, previous: previousPb.cs, delta: previousPb.cs - currentPb.cs };
  }, [series, activeCombo]);

  if (results.length === 0) {
    return (
      <div className="card">
        <h2 className="mb-2 font-semibold">Performance</h2>
        <div className="empty-state">
          <p className="empty-state-title">No performance data yet</p>
          <p className="empty-state-desc">Hasil renang atlet ini akan muncul di sini setelah dicatat coach/admin.</p>
        </div>
      </div>
    );
  }

  const chartMax = series.length ? Math.max(...series.map((s) => s.cs)) : 0;
  const chartMin = series.length ? Math.min(...series.map((s) => s.cs)) : 0;

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><p className="stat-label">Total Hasil</p><p className="stat-value">{results.length}</p></div>
        <div className="stat-card"><p className="stat-label">Personal Best</p><p className="stat-value">{pbs.size}</p></div>
        <div className="stat-card"><p className="stat-label">Kompetisi</p><p className="stat-value">{new Set(results.map((r) => r.event_id ?? r.meet_name).filter(Boolean)).size}</p></div>
      </div>

      {/* Stroke overview */}
      <div className="card overflow-x-auto">
        <h2 className="card-title mb-3">Stroke Overview</h2>
        <table className="table !min-w-[520px]">
          <thead><tr><th>Stroke</th><th>PB</th><th>Hasil Terakhir</th><th>Terbaik</th><th>Jumlah</th></tr></thead>
          <tbody>
            {Array.from(byStroke.entries()).map(([stroke, s]) => (
              <tr key={stroke}>
                <td className="font-medium">{stroke}</td>
                <td>{s.pb != null ? formatTime(s.pb) : "—"}</td>
                <td>{s.last ? `${formatTime(s.last.time_cs)} (${s.last.recorded_at})` : "—"}</td>
                <td>{s.best ? `${formatTime(s.best.time_cs)} (${s.best.distance}m)` : "—"}</td>
                <td>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Riwayat lengkap — terbaru dulu */}
      <div className="card overflow-x-auto">
        <h2 className="card-title mb-3">Riwayat Hasil</h2>
        <table className="table !min-w-[680px]">
          <thead><tr><th>Tanggal</th><th>Nomor</th><th>Waktu</th><th>Kolam</th><th>Meet / Event</th><th>Catatan</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-slate-500">{r.recorded_at}</td>
                <td>{r.stroke} {r.distance}m</td>
                <td className="font-semibold">{formatTime(r.time_cs)}</td>
                <td>{r.pool_length ? `${r.pool_length} m` : "—"}</td>
                <td className="max-w-[160px] truncate">{r.meet_name ?? (r.event_id ? `Event ${r.event_id.slice(0, 8)}…` : "—")}</td>
                <td className="max-w-[200px] truncate">{r.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chart perkembangan */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title">Perkembangan Waktu</h2>
          {combos.length > 1 && (
            <select className="input h-9 max-w-[220px] text-sm" value={activeCombo ?? ""} onChange={(e) => setCombo(e.target.value)} aria-label="Pilih nomor lomba">
              {combos.map((c) => <option key={c}>{c.replace("|", " ")}</option>)}
            </select>
          )}
        </div>
        {series.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada waktu tercatat untuk nomor ini.</p>
        ) : series.length === 1 ? (
          <p className="text-sm text-slate-500">Satu hasil tercatat: <strong>{formatTime(series[0].cs)}</strong> ({series[0].date}). Catat hasil berikutnya untuk melihat tren.</p>
        ) : (
          <>
            <div className="flex items-end gap-3 overflow-x-auto pb-2" role="img" aria-label={`Grafik waktu ${activeCombo}`}>
              {series.map((s, i) => {
                const h = Math.max(10, Math.round(((chartMax - s.cs + 30) / (chartMax - chartMin + 30)) * 72) + 10);
                const prev = i > 0 ? series[i - 1].cs : null;
                const improved = prev != null && s.cs < prev;
                return (
                  <div key={`${s.date}-${i}`} className="flex w-14 shrink-0 flex-col items-center gap-1" title={`${s.date}: ${formatTime(s.cs)}`}>
                    <span className="text-xs font-semibold text-navy-900">{formatTime(s.cs)}</span>
                    <span aria-hidden className={`w-full rounded-t ${improved === true ? "bg-brand-500" : improved === false ? "bg-amber-400" : "bg-slate-300"}`} style={{ height: `${h}px` }} />
                    <span className="whitespace-nowrap text-[10px] text-slate-400">{s.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400"><span className="mr-2 inline-block h-2 w-2 rounded bg-brand-500" />lebih cepat<span className="ml-3 mr-2 inline-block h-2 w-2 rounded bg-amber-400" />lebih lambat dari hasil sebelumnya</p>
          </>
        )}

        {/* Perbandingan PB */}
        {comparison && comparison.delta !== 0 && (
          <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 dark:bg-navy-800">
            <p className="text-sm text-navy-900">
              <strong>{activeCombo?.replace("|", " ")}</strong> — PB saat ini{" "}
              <strong>{formatTime(comparison.current)}</strong>, sebelumnya{" "}
              <strong>{formatTime(comparison.previous)}</strong>{" "}
              {comparison.delta > 0 ? (
                <span className="font-semibold text-brand-700">· membaik {formatTime(comparison.delta)}</span>
              ) : (
                <span className="font-semibold text-amber-600">· melemah {formatTime(Math.abs(comparison.delta))} dibanding PB sebelumnya</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Perbandingan objektif antar hasil tercatat.</p>
          </div>
        )}
      </div>
    </div>
  );
}
