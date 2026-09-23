import type { Athlete } from "@/types";

export type EventStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
export type PaymentStatus = "BELUM_BAYAR" | "MENUNGGU_VERIFIKASI" | "DP" | "LUNAS" | "DITOLAK" | "CANCELLED";

export function birthYearFromDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const year = Number(String(birthDate).slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

export function calculateDolphinKu(birthDate: string | null | undefined): string {
  const year = birthYearFromDate(birthDate);
  if (!year) return "KU belum tersedia";
  if (year >= 2021) return "KU 2021-Keatas";
  if (year === 2020) return "KU 2020";
  if (year === 2019) return "KU 2019";
  if (year >= 2017) return "KU V";
  if (year >= 2015) return "KU IV";
  if (year >= 2013) return "KU III";
  if (year >= 2011) return "KU II";
  return "KU I & Senior";
}

export function effectiveKu(athlete: Pick<Athlete, "birth_date">, override?: string | null): string {
  return override?.trim() || calculateDolphinKu(athlete.birth_date);
}

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function intToRoman(n: number): string | null {
  if (n <= 0 || n > 3999) return null;
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, symbol] of table) {
    while (n >= value) { out += symbol; n -= value; }
  }
  return out;
}

/** Ubah angka Romawi valid menjadi integer. Tolak bentuk tidak kanonik (IIII, VV). */
function romanToInt(raw: string): number | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  for (let i = 0; i < s.length; i++) {
    if (!(s.charAt(i) in ROMAN_VALUES)) return null;
  }
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const value = ROMAN_VALUES[s.charAt(i)];
    total += value >= prev ? value : -value;
    prev = Math.max(prev, value);
  }
  return intToRoman(total) === s ? total : null;
}

/**
 * Kanonik KU: satu-satunya sumber kebenaran untuk MEMBANDINGKAN KU.
 * Kenapa perlu: label KU di database tidak konsisten — event yang sama bisa
 * menyimpan "KU 2021-Ke atas" sedangkan atlet dihitung "KU 2021-Keatas";
 * label lain memakai Romawi ("KU III") sementara event memakai Arab ("KU3").
 *
 * Aturan (sengaja konservatif):
 * - case-insensitive; spasi, tanda hubung, garis bawah diabaikan
 * - Romawi -> Arab: "KU III" => "KU3"
 * - angka tahun dibiarkan: "KU 2019" => "KU2019"
 * - bentuk non-kanonik ditolak (bukan dipaksa cocok), jadi "IIII" tidak
 *   dianggap sama dengan "IV"
 * - "KU I & Senior" tetap berbeda dari "KU1" (bukan kelompok umur yang sama)
 */
export function normalizeKu(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const upper = String(value).trim().toUpperCase();
  if (!upper) return "";
  const compact = upper.replace(/[\s\-_\u2013\u2014]/g, "");
  if (!compact.startsWith("KU")) return compact;
  const rest = compact.slice(2);
  if (!rest) return "KU";
  if (/^\d+$/.test(rest)) return `KU${rest}`;
  const roman = romanToInt(rest);
  if (roman !== null) return `KU${roman}`;
  return `KU${rest}`;
}

/** KU atlet cocok dengan daftar KU nomor lomba? (perbandingan ter-normalisasi) */
export function kuMatches(eventKu: string | null | undefined, allowedKus: readonly string[] | null | undefined): boolean {
  const list = allowedKus ?? [];
  if (list.length === 0) return true; // kosong = semua KU boleh
  const target = normalizeKu(eventKu);
  if (!target) return false;
  return list.some((allowed) => normalizeKu(allowed) === target);
}

export function rupiah(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return {
    BELUM_BAYAR: "Belum Bayar",
    MENUNGGU_VERIFIKASI: "Menunggu Verifikasi",
    DP: "DP",
    LUNAS: "Lunas",
    DITOLAK: "Ditolak",
    CANCELLED: "Dibatalkan",
  }[status];
}
