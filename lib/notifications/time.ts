/**
 * TEAM CAKRA SWIMMING — Notification time utilities.
 * Seluruh otomatisasi memakai Asia/Jakarta (WIB) sesuai konvensi aplikasi.
 */

export const APP_TZ = "Asia/Jakarta";

/** Sekarang dalam WIB sebagai Date objek (shifted). */
export function nowWib(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: APP_TZ });
  return new Date(s);
}

/** Tanggal (YYYY-MM-DD) hari ini menurut WIB. */
export function wibToday(): string {
  return nowWib().toISOString().slice(0, 10);
}

/**
 * Deadline event disimpan sebagai `date` (tanpa waktu).
 * Konvensi: deadline berakhir akhir hari WIB => 23:59:59 WIB.
 * Returns epoch ms of that boundary.
 */
export function deadlineEndWib(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // WIB = UTC+7 -> midnight WIB equals previous day 17:00 UTC
  return Date.UTC(y, m - 1, d, 23 - 7, 59, 59);
}

/** Jam sejak epoch sampai deadline (positif = belum lewat). */
export function hoursUntilDeadline(dateStr: string): number {
  return (deadlineEndWib(dateStr) - Date.now()) / 3600000;
}

/** Format tanggal untuk manusia dalam WIB, mis. "23 Agu 2026". */
export function fmtDateWib(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value) : value;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: APP_TZ });
}
