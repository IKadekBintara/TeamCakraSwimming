import fs from "fs";
import ExcelJS from "exceljs";

const p = "C:/Users/kadexagent/Documents/Atlet cakra/Form_Pendaftaran.xlsx";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(p);
const ws = wb.getWorksheet("Form Pendaftaran");

// map nilai merged: setiap address -> nilai master
const mergedVal = new Map();
const merges = ws._merges ? Object.values(ws._merges) : [];
for (const m of merges) {
  const master = ws.getCell(m.top, m.left).value;
  for (let r = m.top; r <= m.bottom; r++)
    for (let c = m.left; c <= m.right; c++) mergedVal.set(`${r},${c}`, master);
}
const cellVal = (r, c) => {
  const k = `${r},${c}`;
  if (mergedVal.has(k)) return mergedVal.get(k);
  const v = ws.getRow(r).getCell(c).value;
  if (typeof v === "object" && v) return v.text ?? v.result ?? "";
  return v ?? "";
};
const txt = (r, c) => String(cellVal(r, c) ?? "").replace(/\n/g, " ").trim();

// cari kolom KU & thn lahir dengan merged-aware
let kuCol = null, yrCol = null;
for (let c = 1; c <= 20; c++) {
  for (const r of [12, 13, 14]) {
    const u = txt(r, c).toUpperCase();
    if (u.includes("KELOMPOK UMUR")) kuCol = c;
    if (u.includes("TAHUN KELAHIRAN")) yrCol = c;
  }
}
console.log("kolom KU =", kuCol, "| kolom TAHUN LAHIR =", yrCol);

console.log("\n=== DATA r15..r30 (NO | NAMA | THN | KU) ===");
for (let r = 15; r <= 30; r++) {
  const nama = txt(r, 2) || txt(r, 3) || txt(r, 4);
  const thn = txt(r, yrCol);
  const ku = txt(r, kuCol);
  if (nama || thn || ku) console.log(`  r${r}: NO=${txt(r, 1)} | "${nama}" | THN="${thn}" | KU="${ku}"`);
}

const dv = ws.dataValidations?.model ?? {};
console.log("\n=== DROPDOWN ===");
for (const [k, v] of Object.entries(dv)) {
  if (JSON.stringify(v.formulae ?? "").toUpperCase().includes("6B") || k.includes("G"))
    console.log(`  ${k}: type=${v.type} formulae=${JSON.stringify(v.formulae)}`);
}
console.log("\ndataRowCount:", ws.rowCount, "| merges:", merges.length);
