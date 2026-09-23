
import { calculateDolphinKu, normalizeKu, kuMatches } from "../lib/events.ts";

const races = {
  "RENGGANIS": [
    ["25m Kick Bebas", ["KU 2019","KU 2020","KU 2021-Ke atas","KU V"]],
    ["25m Kick Dada",  ["KU 2019","KU 2020","KU 2021-Ke atas","KU V"]],
    ["25m Gaya Bebas", ["KU 2019","KU 2020","KU V"]],
    ["25m Gaya Dunggung", ["KU V"]],
    ["50m Gaya Bebas", ["KU III","KU IV"]],
  ],
  "DOLPHIN": [
    ["25m Kick Bebas", ["KU 2021-Keatas","KU 2020","KU 2019","KU V"]],
    ["25m Gaya Bebas", ["KU 2021-Keatas","KU 2020","KU 2019","KU V"]],
    ["50m Gaya Bebas", ["KU IV","KU III","KU II","KU I & Senior"]],
  ],
};

function run(label, ku, rs) {
  const avail = rs.filter(([, allowed]) => kuMatches(ku, allowed)).map(([n]) => n);
  console.log(`\n[${label}] KU atlet = ${ku}`);
  console.log("  TERSEDIA: " + (avail.length ? avail.join(", ") : "(TIDAK ADA)"));
  return avail;
}

let pass = 0, fail = 0;
function check(desc, cond) { cond ? pass++ : fail++; console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${desc}`); }

console.log("=== KU otomatis dari tanggal lahir (Ayra 2021-09-02) ===");
const kuAyra = calculateDolphinKu("2021-09-02");
console.log("  calculateDolphinKu ->", kuAyra);
check("KU otomatis = KU 2021-Keatas", kuAyra === "KU 2021-Keatas");

console.log("\n=== SKENARIO SCREENSHOT: Ayra di RENGGANIS ===");
const a = run("RENGGANIS/Ayra", kuAyra, races.RENGGANIS);
check("TEST1 25m Kick Bebas MUNCUL", a.includes("25m Kick Bebas"));
check("TEST2 25m Kick Dada MUNCUL", a.includes("25m Kick Dada"));
check("TEST3 25m Gaya Bebas TIDAK muncul", !a.includes("25m Gaya Bebas"));
check("50m Gaya Bebas TIDAK muncul", !a.includes("50m Gaya Bebas"));
check("TIDAK ada pesan kosong", a.length > 0);

console.log("\n=== TEST4/5: KU III vs KU II di 50m Gaya Bebas ===");
check("TEST4 KU III -> 50m Gaya Bebas MUNCUL", kuMatches("KU III", ["KU III","KU IV"]) === true);
check("TEST5 KU II  -> 50m Gaya Bebas TIDAK", kuMatches("KU II", ["KU III","KU IV"]) === false);
check("KU3 (Arab) -> 50m MUNCUL", kuMatches("KU3", ["KU III","KU IV"]) === true);

console.log("\n=== Dolphin tetap normal ===");
const d = run("DOLPHIN/Ayra", kuAyra, races.DOLPHIN);
check("Dolphin 25m Kick Bebas MUNCUL", d.includes("25m Kick Bebas"));
check("Dolphin 50m Gaya Bebas TIDAK", !d.includes("50m Gaya Bebas"));

console.log("\n=== Anti false-positive ===");
check("KU V != KU IV", kuMatches("KU V", ["KU IV"]) === false);
check("KU 2019 != KU 2020", kuMatches("KU 2019", ["KU 2020"]) === false);
check("KU I & Senior != KU1", kuMatches("KU I & Senior", ["KU1"]) === false);
check("allowed_kus kosong = semua", kuMatches("KU V", []) === true);

console.log(`\n===== TOTAL: ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
