import { computeKuJuknis, kuForExcel, racesForKu } from "../../lib/kuJuknis.mjs";

const EXPECT = {
  2021: "KU-6B", 2020: "KU-6A", 2019: "KU-6A", 2018: "KU-5", 2017: "KU-5",
  2016: "KU-4", 2015: "KU-4", 2014: "KU-3", 2013: "KU-3",
};
// tahun di luar rentang WAJIB invalid (jangan dikarang)
const OUT_OF_RANGE = [2012, 2022, 2011, 2023];

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log("  FAIL:", label); } };

console.log("=== 1. MAPPING TAHUN -> KU (9 tahun wajib) ===");
for (const [y, want] of Object.entries(EXPECT)) {
  const r = computeKuJuknis(`${y}-06-15`);
  const excel = kuForExcel(r.ku, "short");
  const wantExcel = want.replace("KU-", "");
  const good = r.ku === want && r.valid && excel === wantExcel;
  ok(good, `thn ${y}: dapat ${r.ku}/${excel}, harusnya ${want}/${wantExcel}`);
  console.log(`  ${good ? "PASS" : "FAIL"}  ${y} -> ${r.ku} | Excel: "${excel}"  (harus ${want} / "${wantExcel}")`);
}

console.log("\n=== 2. TAHUN DI LUAR RENTANG harus INVALID (bukan dikarang) ===");
for (const y of OUT_OF_RANGE) {
  const r = computeKuJuknis(`${y}-01-01`);
  const good = !r.valid && r.ku === "";
  ok(good, `thn ${y} harus invalid, dapat valid=${r.valid} ku="${r.ku}"`);
  console.log(`  ${good ? "PASS" : "FAIL"}  ${y} -> valid=${r.valid} ku="${r.ku}" | ${r.reason}`);
}

console.log("\n=== 3. DATA ASLI (dari DB) ===");
const ATLETS = [
  ["AYRA QUEENARA EL ZHAFIRA", "2021-09-02", "KU-6B"],
  ["ARSYILA RAHMADANIA ALKHAYRA", "2021-05-05", "KU-6B"],
  ["KEVIN BRAMANTYO", "2020-12-09", "KU-6A"],
  ["FAIQ FATIHUL IHSAN", "2019-01-31", "KU-6A"],
  ["MUHAMMAD ALGIS GANENDRA ALFARIZI", "2015-08-16", "KU-4"],
  ["FELISIA ZAHRAN SHAKILA", "2015-08-27", "KU-4"],
];
for (const [nama, bd, want] of ATLETS) {
  const r = computeKuJuknis(bd);
  const excel = kuForExcel(r.ku, "short");
  const good = r.ku === want;
  ok(good, `${nama} (${bd}) -> ${r.ku}, harusnya ${want}`);
  console.log(`  ${good ? "PASS" : "FAIL"}  ${nama.padEnd(32)} ${bd} -> ${r.ku} | Excel: "${excel}"`);
}

console.log("\n=== 4. NOMOR LOMBA PER KU (dari Juknis) ===");
const RACE_EXPECT = {
  "KU-6B": ["25m Kick Bebas", "25m Kick Dada"],
  "KU-6A": ["25m Kick Bebas", "25m Kick Dada", "25m Gaya Bebas", "25m Gaya Dada"],
  "KU-5": ["25m Kick Bebas", "25m Kick Dada", "25m Gaya Bebas", "25m Gaya Dada", "25m Gaya Punggung", "25m Gaya Kupu-Kupu"],
  "KU-4": ["50m Gaya Bebas", "50m Gaya Dada", "50m Gaya Punggung", "50m Gaya Kupu-Kupu"],
  "KU-3": ["50m Gaya Bebas", "50m Gaya Dada", "50m Gaya Punggung", "50m Gaya Kupu-Kupu"],
};
for (const [ku, want] of Object.entries(RACE_EXPECT)) {
  const got = racesForKu(ku);
  const good = JSON.stringify(got) === JSON.stringify(want);
  ok(good, `${ku} races: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  console.log(`  ${good ? "PASS" : "FAIL"}  ${ku}: ${got.length} nomor -> ${got.join(", ")}`);
}

console.log("\n=== 5. ANTI-BUG: 2022 TIDAK masuk 6B (regresi aturan batas) ===");
ok(computeKuJuknis("2022-01-01").ku !== "KU-6B", "2022 harus BUKAN KU-6B");
ok(computeKuJuknis("2012-01-01").ku !== "KU-3", "2012 harus BUKAN KU-3");
console.log("  2022 ->", JSON.stringify(computeKuJuknis("2022-01-01")));
console.log("  2012 ->", JSON.stringify(computeKuJuknis("2012-01-01")));

console.log(`\n===== HASIL: ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
