// TRACE RUNTIME: replikasi PERSIS code path app/(app)/events/[id]/page.tsx
// + components/EventRegistrationForm.tsx, memakai lib/events.ts yang ASLI.
import { calculateDolphinKu, normalizeKu, kuMatches } from "../../lib/events.ts";

// ---- DATA AKTUAL dari halaman (query page.tsx line 23 & 24) ----
// event_races untuk Rengganis (event_id 4fdc3b75-05b4-4462-8bb0-7c28dd51c326)
const races = [
  { id: "r1", name: "25m Kick Bebas", allowed_kus: ["KU 2019", "KU 2020", "KU 2021-Ke atas", "KU V"], is_relay: false, price: 50000, is_free: false },
  { id: "r2", name: "25m Kick Dada", allowed_kus: ["KU 2019", "KU 2020", "KU 2021-Ke atas", "KU V"], is_relay: false, price: 50000, is_free: false },
  { id: "r3", name: "25m Gaya Bebas", allowed_kus: ["KU 2019", "KU 2020", "KU V"], is_relay: false, price: 50000, is_free: false },
  { id: "r4", name: "25m Gaya Dada", allowed_kus: ["KU 2019", "KU 2020", "KU V"], is_relay: false, price: 50000, is_free: false },
  { id: "r5", name: "25m Gaya Punggung", allowed_kus: ["KU V"], is_relay: false, price: 50000, is_free: false },
  { id: "r6", name: "25m Gaya Kupu-Kupu", allowed_kus: ["KU V"], is_relay: false, price: 50000, is_free: false },
  { id: "r7", name: "50m Gaya Bebas", allowed_kus: ["KU III", "KU IV"], is_relay: false, price: 50000, is_free: false },
  { id: "r8", name: "50m Gaya Dada", allowed_kus: ["KU III", "KU IV"], is_relay: false, price: 50000, is_free: false },
  { id: "r9", name: "50m Gaya Punggung", allowed_kus: ["KU III", "KU IV"], is_relay: false, price: 50000, is_free: false },
  { id: "r10", name: "50m Gaya Kupu-Kupu", allowed_kus: ["KU III", "KU IV"], is_relay: false, price: 50000, is_free: false },
];

const athlete = { id: "a1", full_name: "AYRA QUEENARA EL ZHAFIRA", birth_date: "2021-09-02", cakra: null };

// ---- REPLIKASI PERSIS EventRegistrationForm.tsx ----
const kuOverride = "";
const athleteFound = athlete;                       // athlete = athletes.find(a => a.id === athleteId)
const ku = athleteFound ? calculateDolphinKu(athleteFound.birth_date) : "—";
const effectiveKu = kuOverride || ku;
const availableRaces = races.filter((r) => kuMatches(effectiveKu, r.allowed_kus));

// ---- Output bukti (format yang diminta) ----
console.log("========== TRACE RUNTIME ==========");
console.log("ATHLETE:", athlete.full_name);
console.log("ATHLETE KU RAW       :", JSON.stringify(ku));
console.log("EFFECTIVE KU (form)  :", JSON.stringify(effectiveKu));
console.log("normalized athlete KU:", JSON.stringify(normalizeKu(effectiveKu)));
console.log("");

for (const r of races) {
  const normRace = r.allowed_kus.map(normalizeKu);
  const hit = r.allowed_kus.some((k) => normalizeKu(k) === normalizeKu(effectiveKu));
  console.log(`RACE: "${r.name}"`);
  console.log(`  RACE ALLOWED KU RAW : ${JSON.stringify(r.allowed_kus)}`);
  console.log(`  normalized race KUs : ${JSON.stringify(normRace)}`);
  console.log(`  comparison result   : ${hit}`);
}
console.log("");
console.log("========== HASIL filteredRaces(athlete) ==========");
console.log("filteredRaces:", availableRaces.map((r) => r.name));
console.log("jumlah        :", availableRaces.length);
console.log("UI label      : Uang event (" + availableRaces.length + " nomor)");

// ---- Asserts ----
const names = availableRaces.map((r) => r.name);
let fail = 0;
function ck(d, c) { if (!c) { fail++; console.log("  **FAIL** " + d); } else console.log("  PASS  " + d); }
console.log("");
console.log("========== EXPECTED (dari user) ==========");
ck("25m Kick Bebas MUNCUL", names.includes("25m Kick Bebas"));
ck("25m Kick Dada MUNCUL", names.includes("25m Kick Dada"));
ck("25m Gaya Bebas TIDAK muncul", !names.includes("25m Gaya Bebas"));
ck("FILTERED = tepat 2 nomor", names.length === 2);
ck("UI = (2 nomor), bukan (0 nomor)", names.length === 2);
console.log("\nRESULT: " + (fail ? `${fail} FAIL` : "ALL PASS"));
process.exit(fail ? 1 : 0);
