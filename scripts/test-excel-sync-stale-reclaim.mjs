/**
 * test-excel-sync-stale-reclaim.mjs — E2E regression: Hilangkan dari Event → daftar ulang →
 * baris Excel di-reclaim dengan KU baru (bukan DATA_MISMATCH palsu).
 * Menggunakan event + config fixture sendiri; file Excel template sendiri.
 * Semua fixture dibersihkan di akhir (idempotent).
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { readFileSync, rmSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });

const TAG = `KUE2E${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const XLSX_FILE = `D:/Projects/TeamCakraExcel/${TAG}-e2e.xlsx`;
let pass = 0, fail = 0;
const ok = (c, l, d = "") => { console.log(`${c ? "  PASS" : "  FAIL"} ${l}${c ? "" : " — " + d}`); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (ws, r, c) => { const v = ws.getCell(r, c).value; if (v && typeof v === "object" && v.richText) return v.richText.map((t) => t.text).join(""); return v === null || v === undefined ? "" : String(v); };

console.log(`=== E2E REGRESSION STALE-ROW RECLAIM (${TAG}) ===`);

// ---------- fixtures ----------
// Template: header r21, data r22..r31, kolom NO(1) KU(2) PA/PI(3) NAMA(4) TGL(5)
const wb = new ExcelJS.Workbook();
const ws0 = wb.addWorksheet("FORMULIR A1");
for (let r = 1; r <= 21; r++) ws0.getCell(r, 1).value = r === 21 ? "NO" : "";
ws0.getCell(21, 2).value = "KU"; ws0.getCell(21, 3).value = "PA/PI"; ws0.getCell(21, 4).value = "NAMA"; ws0.getCell(21, 5).value = "Tanggal Lahir";
await wb.xlsx.writeFile(XLSX_FILE);

const ev = (await db.from("events").insert({ name: `${TAG} Event`, event_date: "2026-12-19", status: "OPEN" }).select().single()).data;
const par = (await db.from("parents").insert({ full_name: TAG, whatsapp: "6281200000002" }).select().single()).data;
const ath = (await db.from("athletes").insert({ full_name: `${TAG} AMIRUL TEST`, gender: "M", birth_date: "2014-10-29", cakra: "Cakra 2", parent_id: par.id, status: "ACTIVE" }).select().single()).data;
const race = (await db.from("event_races").insert({ event_id: ev.id, name: `${TAG} 50M`, ku_label: "KU III", price: 55000 }).select().single()).data;
console.log("fixture: event/race/athlete dibuat");

const ins = async (t, p) => { const { data, error } = await db.from(t).insert(p).select().single(); if (error) throw new Error(`INSERT ${t}: ${error.message}`); return data; };

// Config sync untuk event fixture (enabled) — mapping kolom standar A1
const cfg = await ins("excel_sync_configurations", {
  name: `${TAG} cfg`, event_id: ev.id, enabled: true,
  file_path: XLSX_FILE, worksheet_name: "FORMULIR A1",
  header_row: 21, first_data_row: 22, max_row: 31,
  mapping: { no: "NO", ku: "KU", gender: "PA/PI", name: "NAMA", birth_date: "Tanggal Lahir" },
  duplicate_strategy: "update_empty_fields",
});
// jobs.payload NOT NULL → siapkan insert job dengan payload default
const insJob = async (p) => { const { data, error } = await db.from("excel_sync_jobs").insert({ payload: {}, ...p }).select().single(); if (error) throw new Error(`INSERT excel_sync_jobs: ${error.message}`); return data; };
const cfgJobBase = { configuration_id: cfg.id };
console.log(`fixture: cfg ${cfg.id}`);

// Aktifkan global sync (simpan state lama)
const globalOld = (await db.from("excel_sync_settings").select("enabled").eq("id", "global").maybeSingle()).data?.enabled;
await db.from("excel_sync_settings").update({ enabled: true }).eq("id", "global");

// helper tunggu job selesai
async function waitJobDone(label, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { data: jobs } = await db.from("excel_sync_jobs").select("id, status, last_error, action, registration_id")
      .eq("configuration_id", cfg.id).order("id", { ascending: false }).limit(3);
    const j = jobs?.[0];
    if (j && ["SUCCESS", "FAILED", "REVIEW_REQUIRED", "SKIPPED_DISABLED"].includes(j.status)) return j;
    await sleep(1500);
  }
  return null;
}
async function waitForNewJob(fromId, label, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { data: jobs } = await db.from("excel_sync_jobs").select("id, status, last_error, action")
      .eq("configuration_id", cfg.id).gt("id", fromId).order("id", { ascending: false }).limit(1);
    const j = jobs?.[0];
    if (j && ["SUCCESS", "FAILED", "REVIEW_REQUIRED", "SKIPPED_DISABLED"].includes(j.status)) return j;
    await sleep(1500);
  }
  return null;
}
let lastJobId = 0;
{ const { data: j0 } = await db.from("excel_sync_jobs").select("id").eq("configuration_id", cfg.id).order("id", { ascending: false }).limit(1); lastJobId = j0?.[0]?.id ?? 0; }

try {
  // ===== TAHAP 1: registrasi pertama (KU lama) =====
  const reg1 = await ins("event_registrations", { event_id: ev.id, athlete_id: ath.id, ku: "KU 2021-Keatas", status: "REGISTERED" });
  let j = await waitForNewJob(lastJobId);
  lastJobId = Math.max(lastJobId, j?.id ?? lastJobId);
  ok(j?.status === "SUCCESS", "T1 job upsert reg1 SUCCESS", JSON.stringify(j));
  let wbR = new ExcelJS.Workbook(); await wbR.xlsx.readFile(XLSX_FILE);
  let wsR = wbR.getWorksheet("FORMULIR A1");
  let r22 = { no: cell(wsR, 22, 1), ku: cell(wsR, 22, 2), g: cell(wsR, 22, 3), name: cell(wsR, 22, 4), bd: cell(wsR, 22, 5) };
  ok(r22.name.toUpperCase() === `${TAG} AMIRUL TEST`.toUpperCase() && r22.ku === "2021-Keatas", "T2 baris r22 terisi KU 2021-Keatas", JSON.stringify(r22));

  // ===== TAHAP 2: SIMULASI "Hilangkan dari Event" (delete langsung, seperti route) =====
  await db.from("event_registration_entries").delete().eq("registration_id", reg1.id);
  await db.from("event_payments").delete().eq("registration_id", reg1.id);
  await db.from("event_registrations").delete().eq("id", reg1.id);
  j = await waitForNewJob(lastJobId);
  lastJobId = Math.max(lastJobId, j?.id ?? lastJobId);
  ok(j?.action === "delete_registration" && j?.status === "SUCCESS", "T3 trigger DELETE meng-enqueue job delete_registration SUCCESS", JSON.stringify(j));
  wbR = new ExcelJS.Workbook(); await wbR.xlsx.readFile(XLSX_FILE);
  wsR = wbR.getWorksheet("FORMULIR A1");
  r22 = { ku: cell(wsR, 22, 2), name: cell(wsR, 22, 4) };
  ok(r22.name === "" && r22.ku === "", "T4 r54-style baris dibersihkan setelah delete", JSON.stringify(r22));
  const mapAfterDel = (await db.from("excel_sync_row_mappings").select("*").eq("configuration_id", cfg.id)).data ?? [];
  ok(mapAfterDel.length === 0, "T5 mapping row dibersihkan", JSON.stringify(mapAfterDel.map((m) => m.excel_row)));

  // ===== TAHAP 3: daftar ulang (KU baru) =====
  const reg2 = await ins("event_registrations", { event_id: ev.id, athlete_id: ath.id, ku: "KU III", status: "REGISTERED" });
  j = await waitForNewJob(lastJobId);
  lastJobId = Math.max(lastJobId, j?.id ?? lastJobId);
  ok(j?.status === "SUCCESS", "T6 job upsert reg2 SUCCESS (bukan REVIEW_REQUIRED)", JSON.stringify(j));
  wbR = new ExcelJS.Workbook(); await wbR.xlsx.readFile(XLSX_FILE);
  wsR = wbR.getWorksheet("FORMULIR A1");
  r22 = { no: cell(wsR, 22, 1), ku: cell(wsR, 22, 2), g: cell(wsR, 22, 3), name: cell(wsR, 22, 4), bd: cell(wsR, 22, 5) };
  ok(r22.ku === "III" && r22.name.toUpperCase() === `${TAG} AMIRUL TEST`.toUpperCase(), "T7 baris dipakai ulang dengan KU III (DB source of truth)", JSON.stringify(r22));

  // ===== TAHAP 4: dry run harus bersih =====
  await insJob({ ...cfgJobBase, action: "dry_run", payload: { trigger: "e2e" } });
  j = await waitForNewJob(lastJobId);
  ok(j?.status === "SUCCESS", "T8 dry run SUCCESS", JSON.stringify(j));
  const lastDry = (await db.from("excel_sync_configurations").select("last_dry_run").eq("id", cfg.id).maybeSingle()).data?.last_dry_run;
  ok(lastDry?.review_required === 0 && lastDry?.mismatch?.length === 0, "T9 dry run 0 review / 0 mismatch", JSON.stringify(lastDry));

  // ===== TAHAP 5: verifikasi mapping reg2 → baris yang sama =====
  const map2 = (await db.from("excel_sync_row_mappings").select("*").eq("configuration_id", cfg.id).eq("registration_id", reg2.id).maybeSingle()).data;
  ok(map2?.excel_row === 22, "T10 mapping reg2 = r22", JSON.stringify(map2?.excel_row));
} finally {
  // ===== cleanup (idempotent) =====
  console.log("\n--- cleanup fixture ---");
  const regs = (await db.from("event_registrations").select("id").eq("event_id", ev.id)).data ?? [];
  for (const r of regs) {
    await db.from("event_registration_entries").delete().eq("registration_id", r.id);
    await db.from("event_payments").delete().eq("registration_id", r.id);
  }
  await db.from("event_registrations").delete().eq("event_id", ev.id);
  await db.from("excel_sync_jobs").delete().eq("configuration_id", cfg.id);
  await db.from("event_races").delete().eq("event_id", ev.id);
  await db.from("excel_sync_configurations").delete().eq("id", cfg.id); // mappings ikut cascade
  await db.from("athletes").delete().eq("id", ath.id);
  await db.from("parents").delete().eq("id", par.id);
  await db.from("events").delete().eq("id", ev.id);
  if (globalOld !== undefined) await db.from("excel_sync_settings").update({ enabled: globalOld }).eq("id", "global");
  try { rmSync(XLSX_FILE); } catch {}
  console.log("cleanup OK");
}

console.log(`\n=== HASIL: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
