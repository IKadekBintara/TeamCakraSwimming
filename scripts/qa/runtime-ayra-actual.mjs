// RUNTIME TEST dengan data AKTUAL (diambil via SQL/MCP, karena RLS memblokir anon key).
// Menjalankan PERSIS code path components/EventRegistrationForm.tsx memakai lib/events.ts ASLI.
const { calculateDolphinKu, normalizeKu, kuMatches } = await import("../../lib/events.ts");

// Data AKTUAL dari Supabase (event_races Rengganis + athlet AYRA)
const races = [
  { id:"r1",  name:"25m Kick Bebas",       allowed_kus:["KU 2019","KU 2020","KU 2021-Ke atas","KU V"], is_relay:false, price:50000, is_free:false },
  { id:"r2",  name:"25m Kick Dada",        allowed_kus:["KU 2019","KU 2020","KU 2021-Ke atas","KU V"], is_relay:false, price:50000, is_free:false },
  { id:"r3",  name:"25m Gaya Bebas",       allowed_kus:["KU 2019","KU 2020","KU V"],                    is_relay:false, price:50000, is_free:false },
  { id:"r4",  name:"25m Gaya Dada",        allowed_kus:["KU 2019","KU 2020","KU V"],                    is_relay:false, price:50000, is_free:false },
  { id:"r5",  name:"25m Gaya Punggung",    allowed_kus:["KU V"],                                       is_relay:false, price:50000, is_free:false },
  { id:"r6",  name:"25m Gaya Kupu-Kupu",   allowed_kus:["KU V"],                                       is_relay:false, price:50000, is_free:false },
  { id:"r7",  name:"50m Gaya Bebas",       allowed_kus:["KU III","KU IV"],                             is_relay:false, price:50000, is_free:false },
  { id:"r8",  name:"50m Gaya Dada",        allowed_kus:["KU III","KU IV"],                             is_relay:false, price:50000, is_free:false },
  { id:"r9",  name:"50m Gaya Punggung",    allowed_kus:["KU III","KU IV"],                             is_relay:false, price:50000, is_free:false },
  { id:"r10", name:"50m Gaya Kupu-Kupu",   allowed_kus:["KU III","KU IV"],                             is_relay:false, price:50000, is_free:false },
];
const athlete = { id:"28fe9c6f-c11c-433d-8b0a-b9a4778b73ab", full_name:"AYRA QUEENARA EL ZHAFIRA", birth_date:"2021-09-02" };

console.log("=========== RUNTIME TEST: code path EventRegistrationForm ===========");
console.log("ATHLETE :", athlete.full_name, "|", athlete.birth_date);

const ku = calculateDolphinKu(athlete.birth_date);          // line 23
const kuOverride = "";
const effectiveKu = kuOverride || ku;                        // line 24
const availableRaces = races.filter((r) => kuMatches(effectiveKu, r.allowed_kus)); // line 25
const selectedRaces = [];

console.log("KU RAW (calculateDolphinKu) :", JSON.stringify(ku));
console.log("normalized athlete KU       :", JSON.stringify(normalizeKu(effectiveKu)));
console.log("");
console.log("--- perbandingan tiap race ---");
for (const r of races) {
  const ok = kuMatches(effectiveKu, r.allowed_kus);
  console.log(`${ok ? "ELIGIBLE " : "tidak    "} ${r.name.padEnd(20)} ${JSON.stringify(r.allowed_kus)} -> ${JSON.stringify(r.allowed_kus.map(normalizeKu))}`);
}
console.log("");
console.log("=========== UI OUTPUT ===========");
console.log("availableRaces.length :", availableRaces.length);
console.log("tampil di UI          :", availableRaces.map(r=>r.name));
console.log("Label                 : \"Uang event (" + selectedRaces.length + " nomor)\"");
console.log("Pesan                 :", availableRaces.length===0 ? '"Tidak ada nomor yang sesuai KU ini."' : "(0 nomor -> pesan TIDAK muncul karena ada "+availableRaces.length+" nomor)");
console.log("");

const names = availableRaces.map(r=>r.name);
let fail=0; const ck=(d,c)=>{console.log(`  ${c?"PASS":"**FAIL**"}  ${d}`); if(!c)fail++;};
console.log("=========== EXPECTED (dari user) ===========");
ck("25m Kick Bebas MUNCUL", names.includes("25m Kick Bebas"));
ck("25m Kick Dada MUNCUL", names.includes("25m Kick Dada"));
ck("25m Gaya Bebas TIDAK muncul", !names.includes("25m Gaya Bebas"));
ck("FILTERED RACES untuk AYRA = ['25m Kick Bebas','25m Kick Dada']", JSON.stringify(names)===JSON.stringify(["25m Kick Bebas","25m Kick Dada"]));
ck("normalizeKu('KU 2021-Keatas') = 'KU2021KEATAS'", normalizeKu("KU 2021-Keatas")==="KU2021KEATAS");
ck("normalizeKu('KU 2021-Ke atas') = 'KU2021KEATAS'", normalizeKu("KU 2021-Ke atas")==="KU2021KEATAS");
ck("KU 2021-Keatas MATCH KU 2021-Ke atas", normalizeKu("KU 2021-Keatas")===normalizeKu("KU 2021-Ke atas"));
console.log("\nRESULT:", fail?`${fail} FAIL`:"ALL PASS");
process.exit(fail?1:0);
