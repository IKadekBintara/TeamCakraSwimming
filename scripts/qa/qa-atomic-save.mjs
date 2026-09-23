/**
 * TEST atomic-save.mjs
 * ====================
 * 1. Simpan normal -> file tujuan tergantikan, TIDAK ada temp tersisa.
 * 2. Simulasi pembaca memegang file (handle terbuka) -> harus RETRY lalu sukses.
 * 3. File tujuan tetap UTUH selama proses (tidak pernah kosong/hilang).
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { saveWorkbookAtomic, listStaleTemps } from "../../worker/atomic-save.mjs";

const DIR = path.resolve("./scripts/qa/_tmp_atomic");
await fsp.mkdir(DIR, { recursive: true });
const TARGET = path.join(DIR, "Form_Pendaftaran.xlsx");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  PASS", l); } else { fail++; console.log("  FAIL", l); } };

// siapkan file awal
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Form Pendaftaran");
  ws.getCell("G15").value = "LAMA";
  await wb.xlsx.writeFile(TARGET);
}
const sizeBefore = fs.statSync(TARGET).size;

console.log("=== TEST 1: save normal (atomic) ===");
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET);
  wb.getWorksheet("Form Pendaftaran").getCell("G15").value = "BARU";
  const res = await saveWorkbookAtomic(wb, TARGET);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(TARGET);
  ok(wb2.getWorksheet("Form Pendaftaran").getCell("G15").value === "BARU", "nilai berubah LAMA -> BARU");
  ok(res.retries === 0, `tanpa retry (retries=${res.retries})`);
  const temps = await listStaleTemps(TARGET);
  ok(temps.length === 0, `tidak ada file temp tersisa (${temps.length})`);
  ok(!fs.existsSync(res.tmp), "file temp sudah hilang");
  console.log("   size:", sizeBefore, "->", fs.statSync(TARGET).size);
}

console.log("\n=== TEST 2: pembaca memegang file (simulasi Syncthing/Excel) ===");
{
  // Buka handle baca tulis lama pada TARGET -> rename harus RETRY sampai dilepas.
  const fd = await fsp.open(TARGET, "r+");
  let released = false;
  setTimeout(async () => { try { await fd.close(); released = true; console.log("   (handle pembaca dilepas)"); } catch {} }, 700);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET);
  wb.getWorksheet("Form Pendaftaran").getCell("G15").value = "SETELAH-LOCK";
  const t0 = Date.now();
  const res = await saveWorkbookAtomic(wb, TARGET, { retries: 20, baseDelayMs: 100 });
  const dur = Date.now() - t0;
  ok(released, "handle pembaca benar-benar dilepas selama retry");
  ok(res.retries > 0, `melakukan retry (retries=${res.retries}) lalu sukses`);
  ok(dur >= 500, `menunggu pembaca (${dur}ms)`);

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(TARGET);
  ok(wb2.getWorksheet("Form Pendaftaran").getCell("G15").value === "SETELAH-LOCK", "nilai akhir benar");
  const temps = await listStaleTemps(TARGET);
  ok(temps.length === 0, `tidak ada temp tersisa (${temps.length})`);
}

console.log("\n=== TEST 3: file tujuan TIDAK PERNAH hilang/kosong ===");
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET);
  wb.getWorksheet("Form Pendaftaran").getCell("G16").value = "X";
  const poll = setInterval(() => {
    if (!fs.existsSync(TARGET)) { fail++; console.log("  FAIL file hilang saat save!"); }
    else if (fs.statSync(TARGET).size === 0) { fail++; console.log("  FAIL file kosong saat save!"); }
  }, 5);
  await saveWorkbookAtomic(wb, TARGET);
  clearInterval(poll);
  ok(fs.existsSync(TARGET) && fs.statSync(TARGET).size > 0, "file utuh & tidak pernah kosong");
}

await fsp.rm(DIR, { recursive: true, force: true });
console.log(`\n===== HASIL: ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
