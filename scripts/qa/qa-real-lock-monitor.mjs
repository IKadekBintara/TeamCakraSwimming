/**
 * REAL TEST: worker menulis Excel + tidak meninggalkan lock.
 * =========================================================
 * Memantau SEPANJANG proses sync:
 *   - apakah file tujuan pernah HILANG (harus TIDAK)
 *   - apakah file tujuan pernah terkunci (Restart Manager)
 *   - apakah ada sisa file .tmp-
 *   - apakah KU tetap sesuai Juknis setelah save
 */
import fsp from "node:fs/promises";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process";

const PATH = "C:/Users/kadexagent/Documents/atlet cakra/Form_Pendaftaran.xlsx";
const DIR = "C:/Users/kadexagent/Documents/atlet cakra";
const SHEET = "Form Pendaftaran";
const DURATION_MS = Number(process.argv[2] ?? 40000);

const mergedValue = (ws, r, c) => {
  for (const m of Object.values(ws._merges ?? {}))
    if (r >= m.top && r <= m.bottom && c >= m.left && c <= m.right) return ws.getCell(m.top, m.left).value;
  const v = ws.getRow(r).getCell(c).value;
  return typeof v === "object" && v ? (v.text ?? v.result ?? "") : v;
};

function holder(path) {
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      "scripts/qa/find-file-handle.ps1", "-Path", path], { encoding: "utf8", timeout: 60000 });
    if (/tidak ada proses/.test(out)) return "NONE";
    const m = out.match(/HOLDER:\s*(\S+)/g);
    return m ? m.join("; ") : "?";
  } catch { return "ERR"; }
}

const dumps = () => fs.readdirSync(DIR).filter((n) => n.includes(".tmp-") || n.startsWith("~$"));

console.log("MONITORING:", PATH);
console.log("durasi:", DURATION_MS, "ms | mulai:", new Date().toISOString());
console.log("baseline tmp/~$ :", JSON.stringify(dumps()));

let vanished = 0, zero = 0, locked = 0, samples = 0;
const t0 = Date.now();
while (Date.now() - t0 < DURATION_MS) {
  samples++;
  if (!fs.existsSync(PATH)) { vanished++; console.log("  !! FILE HILANG"); }
  else if (fs.statSync(PATH).size === 0) { zero++; console.log("  !! FILE KOSONG"); }
  const h = holder(PATH);
  if (h !== "NONE") { locked++; console.log("  !! TERKUNCI oleh:", h); }
  await new Promise((r) => setTimeout(r, 1500));
}

console.log("\n=== HASIL MONITORING ===");
console.log("samples:", samples, "| file hilang:", vanished, "| file kosong:", zero, "| sampel terkunci:", locked);
console.log("tmp/~$ setelah:", JSON.stringify(dumps()));

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(PATH);
const ws = wb.getWorksheet(SHEET);
let kuCol = null, yrCol = null;
for (let c = 1; c <= 20; c++)
  for (const r of [12, 13, 14]) {
    const u = String(mergedValue(ws, r, c) ?? "").toUpperCase();
    if (u.includes("KELOMPOK UMUR")) kuCol = c;
    if (u.includes("TAHUN KELAHIRAN")) yrCol = c;
  }
const EXPECT = { 2021: "6B", 2020: "6A", 2019: "6A", 2018: "5", 2017: "5", 2016: "4", 2015: "4", 2014: "3", 2013: "3" };
console.log("\n=== KU SETELAH SYNC (cek Juknis) ===");
let bad = 0;
for (let r = 15; r <= 64; r++) {
  const nama = String(mergedValue(ws, r, 2) ?? "").trim();
  if (!nama) continue;
  const thn = String(mergedValue(ws, r, yrCol) ?? "").trim();
  const ku = String(mergedValue(ws, r, kuCol) ?? "").trim();
  const want = EXPECT[Number(thn)];
  const good = want === undefined || ku.toUpperCase() === want.toUpperCase();
  if (!good) bad++;
  console.log(`  r${r} "${nama.slice(0, 30).padEnd(30)}" THN=${thn} KU="${ku}" ${good ? "OK" : "SALAH (harus " + want + ")"}`);
}
console.log("\nmerge:", Object.keys(ws._merges ?? {}).length, "| rowCount:", ws.rowCount);
console.log(bad === 0 && vanished === 0 && zero === 0 && locked === 0 ? "\n===== REAL TEST: LULUS =====" : `\n===== REAL TEST: GAGAL (bad=${bad} vanished=${vanished} zero=${zero} locked=${locked}) =====`);
