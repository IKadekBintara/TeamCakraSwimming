/**
 * TEAM CAKRA SWIMMING — Performance timing utilities.
 * Waktu renang disimpan sebagai integer centiseconds di database
 * (36.21s -> 3621). Semakin kecil = semakin cepat.
 */

export const STROKES = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Individual Medley"] as const;
export type Stroke = (typeof STROKES)[number];

/** Format centiseconds menjadi teks waktu: 3621 -> "36.21", 8345 -> "1:23.45". */
export function formatTime(cs: number | null | undefined): string {
  if (cs == null || cs <= 0) return "—";
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const cents = cs % 100;
  const ss = String(seconds).padStart(minutes > 0 ? 2 : 1, "0");
  const cc = String(cents).padStart(2, "0");
  return minutes > 0 ? `${minutes}:${ss}.${cc}` : `${seconds}.${cc}`;
}

/**
 * Parse input waktu fleksibel ke centiseconds.
 * Menerima "36.21", "36", "36.2" (-> 3620), "1:23.45".
 * Mengembalikan null jika format tidak valid.
 */
export function parseTimeToCs(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const minutes = m[1] ? parseInt(m[1], 10) : 0;
  const seconds = parseInt(m[2], 10);
  if (seconds >= 60 && !m[1]) return null;
  const cents = m[3] ? parseInt(m[3].padEnd(2, "0").slice(0, 2), 10) : 0;
  const total = minutes * 6000 + seconds * 100 + cents;
  return total > 0 ? total : null;
}

export type PerfResult = {
  id: string;
  athlete_id: string;
  recorded_at: string;
  stroke: string;
  distance: number;
  time_cs: number | null;
  pool_length: number | null;
  event_id: string | null;
  meet_name: string | null;
  notes: string | null;
  rank: number | null;
};

/** Kunci kelompok PB: stroke + distance (+ pool length bila dipakai). */
export function comboKey(r: Pick<PerfResult, "stroke" | "distance">): string {
  return `${r.stroke}|${r.distance}m`;
}

export type PbEntry = { time_cs: number; recorded_at: string; result_id: string };

/**
 * Personal Best per kombinasi stroke+distance.
 * Semakin kecil waktu = lebih baik. History tidak pernah diubah.
 */
export function computePbs(rows: PerfResult[]): Map<string, PbEntry> {
  const pbs = new Map<string, PbEntry>();
  for (const r of rows) {
    if (r.time_cs == null) continue;
    const key = comboKey(r);
    const cur = pbs.get(key);
    if (!cur || r.time_cs < cur.time_cs) {
      pbs.set(key, { time_cs: r.time_cs, recorded_at: r.recorded_at, result_id: r.id });
    }
  }
  return pbs;
}

export const STROKE_LABELS: Record<string, string> = {
  Freestyle: "Freestyle",
  Backstroke: "Backstroke",
  Breaststroke: "Breaststroke",
  Butterfly: "Butterfly",
  "Individual Medley": "Individual Medley",
};
