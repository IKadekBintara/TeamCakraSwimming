import type { Athlete } from "@/types";

import { createClient } from "@/lib/supabase/server";

export async function getCakraGroups() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_groups")
    .select("id, name")
    .order("name");
  if (error) {
    console.error("Failed to fetch groups:", error);
    return [];
  }
  return data;
}

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
