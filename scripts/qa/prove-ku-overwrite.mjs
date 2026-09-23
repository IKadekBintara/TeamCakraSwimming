/**
 * BUKTI PERUBAHAN CELL KU
 * =======================
 * 1. Tulis nilai KU LAMA ("2021-KE ATAS", "2020", "2019") langsung ke file Excel
 *    (mensimulasikan kondisi file yang dilihat user).
 * 2. Jalankan FULL RESYNC lewat worker (job reconcile).
 * 3. Baca kembali cell KU → harus berubah menjadi Juknis.
 */
import ExcelJS from "exceljs";
import fs from "fs";

const PATH = "C:/Users/kadexagent/Documents/Atlet cakra/Form_Pendaftaran.xlsx";
const SHEET = "Form Pendaftaran";

const mergedValue = (ws, r, c) => {
  for (const m of Object.values(ws._merges ?? {})) {
    if (r >= m.top && r <= m.bottom && c >= m.left && c <= m.right)
      return ws.getCell(m.top, m.left).value;
  }
  const v = ws.getRow(r).getCell(c).value;
  return typeof v === "object" && v ? (v.text ?? v.result ?? "") : v;
};

if (process.argv[2] === "dump") {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATH);
  const ws = wb.getWorksheet(SHEET);
  console.log("PATH:", PATH);
  console.log("mtime:", fs.statSync(PATH).mtime.toISOString(), "| size:", fs.statSync(PATH).size);
  let kuCol = null, yrCol = null;
  for (let c = 1; c <= 20; c++)
    for (const r of [12, 13, 14]) {
      const u = String(mergedValue(ws, r, c) ?? "").toUpperCase();
      if (u.includes("KELOMPOK UMUR")) kuCol = c;
      if (u.includes("TAHUN KELAHIRAN")) yrCol = c;
    }
  console.log(`kolom KU=${kuCol} (${ws.getRow(12).getCell(kuCol).address[0]}), kolom THN=${yrCol}`);
  for (let r = 15; r <= 25; r++) {
    const nama = String(mergedValue(ws, r, 2) ?? "").trim();
    if (!nama) continue;
    console.log(`  r${r} cell KU = ${ws.getRow(r).getCell(kuCol).address} | "${nama}" | THN=${String(mergedValue(ws, r, yrCol)).trim()} | KU="${String(mergedValue(ws, r, kuCol)).trim()}"`);
  }
} else if (process.argv[2] === "seed-stale") {
  // Tulis nilai KU LAMA (meniru kondisi bug) ke baris yang sudah ada.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATH);
  const ws = wb.getWorksheet(SHEET);
  let kuCol = null;
  for (let c = 1; c <= 20; c++)
    for (const r of [12, 13, 14])
      if (String(mergedValue(ws, r, c) ?? "").toUpperCase().includes("KELOMPOK UMUR")) kuCol = c;
  let n = 0;
  for (let r = 15; r <= 25; r++) {
    const nama = String(mergedValue(ws, r, 2) ?? "").trim();
    if (!nama) continue;
    const thn = String(mergedValue(ws, r, 6)).trim();
    const stale = thn === "2021" ? "2021-KE ATAS" : thn === "2020" ? "2020" : thn === "2019" ? "2019" : "4";
    ws.getRow(r).getCell(kuCol).value = stale;
    console.log(`  seed r${r} ${nama.slice(0, 26).padEnd(26)} -> KU="${stale}"`);
    n++;
  }
  await wb.xlsx.writeFile(PATH);
  console.log(`SEEDED ${n} baris dengan KU LAMA. mtime:`, fs.statSync(PATH).mtime.toISOString());
}
