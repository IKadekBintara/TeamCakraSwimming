import ExcelJS from "exceljs";

const CUR = "C:/Users/kadexagent/Documents/Atlet cakra/Form_Pendaftaran.xlsx";
const BAK = process.argv[2];
const SHEET = "Form Pendaftaran";

async function load(p) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  return wb.getWorksheet(SHEET);
}

const cur = await load(CUR);
const bak = await load(BAK);

console.log("=== FORMATTING CHECK (before vs after) ===");
console.log("merges   :", Object.keys(bak._merges ?? {}).length, "->", Object.keys(cur._merges ?? {}).length,
  Object.keys(bak._merges ?? {}).length === Object.keys(cur._merges ?? {}).length ? "OK" : "BEDA!");
console.log("rowCount :", bak.rowCount, "->", cur.rowCount, bak.rowCount === cur.rowCount ? "OK" : "BEDA!");
console.log("columnCount:", bak.columnCount, "->", cur.columnCount);

// cek lebar kolom
let colDiff = 0;
for (let c = 1; c <= bak.columnCount; c++) {
  const a = bak.getColumn(c).width, b = cur.getColumn(c).width;
  if (Math.abs((a ?? 0) - (b ?? 0)) > 0.01) { colDiff++; console.log(`  width beda col${c}: ${a} -> ${b}`); }
}
console.log("lebar kolom berubah:", colDiff === 0 ? "TIDAK (OK)" : colDiff);

// cek style header (font/border/fill)
const styleStr = (cell) => JSON.stringify({ f: cell.font, b: cell.border, fill: cell.fill, al: cell.alignment });
let styleDiff = 0;
for (const r of [12, 13, 14, 15]) {
  for (let c = 1; c <= 17; c++) {
    const a = styleStr(bak.getRow(r).getCell(c));
    const b = styleStr(cur.getRow(r).getCell(c));
    if (a !== b) { styleDiff++; if (styleDiff <= 5) console.log(`  style beda r${r}c${c}`); }
  }
}
console.log("style sel header+baris1 berubah:", styleDiff === 0 ? "TIDAK (OK)" : styleDiff);

// cek style sel KU (kolom 7) semua baris data
let kuStyleDiff = 0;
for (let r = 15; r <= 64; r++) {
  const a = styleStr(bak.getRow(r).getCell(7));
  const b = styleStr(cur.getRow(r).getCell(7));
  if (a !== b) kuStyleDiff++;
}
console.log("style kolom KU berubah:", kuStyleDiff === 0 ? "TIDAK (OK)" : kuStyleDiff);

console.log("\n=== CENTANG NOMOR LOMBA (r15..r20) ===");
const grp = { 8: "BEBAS/KICK", 9: "BEBAS/25M", 10: "BEBAS/50M", 11: "DADA/KICK", 12: "DADA/25M", 13: "DADA/50M", 14: "KUPU2/25M", 15: "KUPU2/50M", 16: "PUNGGUNG/25M", 17: "PUNGGUNG/50M" };
for (let r = 15; r <= 20; r++) {
  const row = cur.getRow(r);
  const nama = String(row.getCell(2).value ?? "").trim();
  const thn = String(row.getCell(6).value ?? "").trim();
  const ku = String(row.getCell(7).value ?? "").trim();
  const marks = [];
  for (const [c, label] of Object.entries(grp)) {
    const v = String(row.getCell(Number(c)).value ?? "").trim();
    if (v === "✓" || v.toLowerCase() === "v") marks.push(label);
  }
  console.log(`  r${r} ${nama.slice(0, 28).padEnd(28)} THN=${thn} KU=${ku.padEnd(3)} centang: ${marks.join(", ") || "-"}`);
}
