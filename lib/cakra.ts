/**
 * Normalisasi nama Cakra — satu sumber kebenaran untuk seluruh UI.
 *
 * Latar belakang: kolom `cakra` pada athletes/event_payments adalah teks bebas
 * (tidak ada tabel cakra), sehingga nilai historis tidak seragam — mis. atlet
 * memakai "Cakra Atlet" tetapi snapshot pembayaran memakai "Team Cakra Atlet".
 * Fungsi ini merapikan variasi penulisan TANPA mengubah data di database,
 * lalu men-jepat hasilnya ke daftar kanonik CAKRA_GROUPS bila cocok
 * (case-insensitive), agar rekap per-Cakra tidak terpecah beberapa baris.
 */
import { CAKRA_GROUPS } from "./events";

/** Pola variasi prefix historis: "Team Cakra …" / "team cakra…" */
const TEAM_PREFIX = /^team\s+cakra\s+/i;

export function normalizeCakra(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === "-") return "Tidak tersedia";
  const stripped = v.replace(TEAM_PREFIX, "Cakra ");
  const lowerV = v.toLowerCase();
  const lowerS = stripped.toLowerCase();
  const canonical = CAKRA_GROUPS.find((c) => {
    const lc = c.toLowerCase();
    return lc === lowerS || lc === lowerV;
  });
  return canonical ?? stripped;
}
