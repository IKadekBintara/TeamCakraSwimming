/**
 * ATURAN KU KHUSUS PER-EVENT (Juknis).
 * ============================================================
 * Sumber kebenaran: JUKNIS "LATBER ANTAR KLUB JEMBER – HUT RSC KE-9 2026".
 *
 * KU dihitung dari TAHUN LAHIR atlet (bukan dari string `registrations.ku`
 * yang tersimpan di DB — string itu bisa berasal dari skema KU versi lama).
 *
 *   Tahun lahir   KU       Nomor lomba yang boleh
 *   ---------------------------------------------------
 *   2021          KU-6B    25 M Kick Bebas, 25 M Kick Dada
 *   2020–2019     KU-6A    25 M Kick Bebas, 25 M Kick Dada,
 *                          25 M Gaya Bebas, 25 M Gaya Dada
 *   2018–2017     KU-5     25 M Kick Bebas, 25 M Kick Dada, 25 M Gaya Bebas,
 *                          25 M Gaya Dada, 25 M Gaya Punggung, 25 M Gaya Kupu-Kupu
 *   2016–2015     KU-4     50 M Gaya Bebas, 50 M Gaya Dada,
 *                          50 M Gaya Punggung, 50 M Gaya Kupu-Kupu
 *   2014–2013     KU-3     50 M Gaya Bebas, 50 M Gaya Dada,
 *                          50 M Gaya Punggung, 50 M Gaya Kupu-Kupu
 *
 * PENTING: rentang bersifat TERTUTUP dan EKSAK — tahun 2012 atau 2022 TIDAK
 * otomatis masuk KU mana pun. Yang di luar rentang ditandai invalid agar
 * tidak ada KU yang "dikarang".
 */

/** Rentang tahun -> kode KU Juknis (urutan tidak penting; dicek rentang). */
export const KU_RULES_RENGGANIS = {
  ranges: [
    { from: 2021, to: 2021, ku: "KU-6B" },
    { from: 2019, to: 2020, ku: "KU-6A" },
    { from: 2017, to: 2018, ku: "KU-5" },
    { from: 2015, to: 2016, ku: "KU-4" },
    { from: 2013, to: 2014, ku: "KU-3" },
  ],
  /** Nomor lomba yang boleh per KU (nama persis seperti di `event_races.name`). */
  races: {
    "KU-6B": ["25m Kick Bebas", "25m Kick Dada"],
    "KU-6A": ["25m Kick Bebas", "25m Kick Dada", "25m Gaya Bebas", "25m Gaya Dada"],
    "KU-5": [
      "25m Kick Bebas",
      "25m Kick Dada",
      "25m Gaya Bebas",
      "25m Gaya Dada",
      "25m Gaya Punggung",
      "25m Gaya Kupu-Kupu",
    ],
    "KU-4": ["50m Gaya Bebas", "50m Gaya Dada", "50m Gaya Punggung", "50m Gaya Kupu-Kupu"],
    "KU-3": ["50m Gaya Bebas", "50m Gaya Dada", "50m Gaya Punggung", "50m Gaya Kupu-Kupu"],
  },
};

/** Tahun kelahiran (number) dari date/timestamp/string → 2021, atau null. */
export function birthYearOf(v) {
  const s = String(v ?? "").trim();
  const m = /(\d{4})/.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * Hitung KU Juknis dari tahun lahir.
 * @returns { ku, year, valid, reason }
 *   valid=false → tahun di luar rentang Juknis (jangan mengarang KU).
 */
export function computeKuJuknis(birthDate, rules = KU_RULES_RENGGANIS) {
  const year = birthYearOf(birthDate);
  if (year === null) return { ku: "", year: null, valid: false, reason: "tahun lahir kosong" };
  for (const r of rules.ranges) {
    if (year >= r.from && year <= r.to) return { ku: r.ku, year, valid: true, reason: "" };
  }
  return {
    ku: "",
    year,
    valid: false,
    reason: `tahun ${year} di luar rentang Juknis (2013–2021)`,
  };
}

/**
 * Format KU utk kolom Excel "KELOMPOK UMUR 6A/6B/5/4/3".
 * Header template memakai bentuk TANPA prefix "KU-", yaitu "6B","6A","5","4","3".
 * (`ku_format` = "short" pada config Rengganis.)
 */
export function kuForExcel(ku, kuFormat) {
  if (!ku) return "";
  if (kuFormat === "short") return ku.replace(/^KU[- ]*/i, "").toUpperCase(); // "KU-6B" -> "6B", "KU 5" -> "5"
  return ku; // "KU-6B"
}

/** Nama nomor lomba yang boleh untuk sebuah KU (dari Juknis). */
export function racesForKu(ku, rules = KU_RULES_RENGGANIS) {
  return rules.races[ku] ?? [];
}
