import fs from "fs";
import ExcelJS from "exceljs";

const p = "C:/Users/kadexagent/Documents/Atlet cakra/Form_Pendaftaran.xlsx";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(p);
const ws = wb.getWorksheet("Form Pendaftaran");
console.log("sheet:", ws.name, "| rows:", ws.rowCount, "| merges:", ws._merges ? Object.keys(ws._merges).length : 0);
console.log("mtime:", fs.statSync(p).mtime.toISOString());
console.log("\n--- baris data 15..24 (NO | NAMA | KU | centang) ---");
for (let r = 15; r <= Math.min(24, ws.rowCount); r++) {
  const row = ws.getRow(r);
  const no = row.getCell(1).value;
  const nama = row.getCell(2).value ?? row.getCell(3).value ?? "";
  const vals = [];
  for (let c = 8; c <= 17; c++) {
    const v = row.getCell(c).value;
    if (v) vals.push(`${String.fromCharCode(64 + c)}=${v}`);
  }
  const namaStr = typeof nama === "object" && nama ? (nama.text ?? nama.result ?? "") : String(nama ?? "");
  if (namaStr || vals.length) console.log(`  r${r}: NO=${no} NAMA="${namaStr}" | ${vals.join(" ")}`);
}
