#!/usr/bin/env node
/**
 * TEAM CAKRA — Excel Sync Worker (RDP background service)
 * =========================================================
 * Polling worker: ambil job dari Supabase (SKIP LOCKED pattern via
 * update...returning), fetch CURRENT STATE database, tulis ke file Excel
 * lokal dengan exceljs (menjaga template), lalu tandai hasil.
 *
 * - Tanpa dependensi Hermes; berjalan sebagai proses biasa / Task Scheduler / NSSM.
 * - Aman restart: job PROCESSING yang tertinggal diambil ulang (stale > 10 menit).
 * - Aman file locked: retry otomatis dengan backoff, tidak pernah force overwrite.
 * - Idempoten: current-state fetch + row mapping stabil (config+registration).
 *
 * ENV wajib (.env.local di root repo):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { statFile, rmFile } from "./fs-utils.mjs";
import path from "node:path";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- env ----------
// Muat .env.local dari root project (relatif lokasi file ini)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
const URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SRK = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !SRK) {
  console.error("[worker] env belum lengkap (.env.local)");
  process.exit(1);
}
const db = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });

const POLL_MS = Number(process.env.EXCEL_SYNC_POLL_MS ?? 5000);
const MAX_RETRY = 5;
const STALE_MS = 10 * 60 * 1000;

const log = (...a) => console.log(new Date().toISOString(), "[worker]", ...a);

async function heartbeat() {
  await db.from("excel_sync_settings").update({ worker_heartbeat: new Date().toISOString() }).eq("id", "global");
}

async function syncLog(action, fields) {
  await db.from("excel_sync_logs").insert({ action, ...fields });
}

/** Ambil satu job PENDING/RETRYING/stale-PROCESSING atomik. */
async function claimJob() {
  const { data, error } = await db.rpc("fn_excel_sync_claim_job");
  if (error) throw new Error(`claim: ${error.message}`);
  return data?.[0] ?? null;
}

async function globalEnabled() {
  const { data } = await db.from("excel_sync_settings").select("enabled").eq("id", "global").maybeSingle();
  return Boolean(data?.enabled);
}

// ---------- helpers data ----------
function normKey(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function fmtDateDDMMYYYY(v) {
  if (!v) return "";
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00Z` : v); // anchor UTC agar tak geser
  if (Number.isNaN(d.getTime())) return String(v);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
function kuShort(ku) {
  const s = String(ku ?? "").trim();
  return s.toUpperCase().startsWith("KU") ? s.slice(2).trim() : s;
}
function genderPAPI(g) {
  const up = String(g ?? "").trim().toUpperCase();
  if (up === "M" || up === "L" || up === "PA") return "PA";
  if (up === "F" || up === "P" || up === "PI") return "PI";
  return ""; // DATA INCOMPLETE — jangan menebak
}

/** Current-state registration untuk job. */
async function fetchCurrentState(registrationId) {
  const { data: reg, error } = await db.from("event_registrations")
    .select("id, event_id, athlete_id, ku, ku_override, status, created_at, athletes(full_name, gender, birth_date)")
    .eq("id", registrationId)
    .maybeSingle();
  if (error) throw new Error(`state reg: ${error.message}`);
  if (!reg) return null; // sudah terhapus → delete semantics
  let races = [];
  if (reg.id) {
    const { data: entries } = await db.from("event_registration_entries")
      .select("event_races(name)").eq("registration_id", reg.id);
    races = (entries ?? []).map((e) => e.event_races?.name).filter(Boolean);
  }
  const { data: pay } = await db.from("event_payments")
    .select("payment_status, total_amount, amount_paid, payment_method")
    .eq("registration_id", reg.id).maybeSingle();
  const ath = Array.isArray(reg.athletes) ? reg.athletes[0] : reg.athletes;
  return {
    registration_id: reg.id,
    athlete_id: reg.athlete_id,
    name: ath?.full_name ?? "",
    gender: genderPAPI(ath?.gender),
    birth_date: fmtDateDDMMYYYY(ath?.birth_date),
    ku: reg.ku_override || reg.ku || "",
    status: reg.status,
    race_names: races.join(", "),
    payment_status: pay?.payment_status ?? "BELUM_BAYAR",
    total_amount: pay ? Number(pay.total_amount) : null,
  };
}

/** Baca workbook + kumpulkan record existing pada area config (untuk dupcheck & reconcile). */
async function readWorkbookRecords(cfg) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(cfg.file_path);
  const ws = wb.getWorksheet(cfg.worksheet_name);
  if (!ws) throw new Error(`Worksheet "${cfg.worksheet_name}" tidak ditemukan`);
  // kolom per field dari mapping (field -> header text); cari index kolom by header row
  const mapping = cfg.mapping ?? {};
  const headerRow = cfg.header_row;
  const colByHeader = {};
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = ws.getCell(headerRow, c).value;
    const t = typeof v === "object" && v !== null && v.richText ? v.richText.map((r) => r.text).join("") : v;
    colByHeader[normKey(t)] = c;
  }
  const cols = {};
  for (const [field, headerText] of Object.entries(mapping)) {
    cols[field] = colByHeader[normKey(headerText)] ?? null;
  }
  const records = [];
  for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws.rowCount); r++) {
    const name = cols.name ? cellText(ws.getCell(r, cols.name)) : "";
    if (!normKey(name)) continue;
    records.push({
      row: r,
      name,
      key: normKey(name),
      values: Object.fromEntries(Object.entries(cols).filter(([, c]) => c).map(([f, c]) => [f, cellText(ws.getCell(r, c))])),
    });
  }
  return { wb, ws, cols, records };
}

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v.text) return String(v.text);
    if (v instanceof Date) return fmtDateDDMMYYYY(v.toISOString());
  }
  return String(v).trim();
}

/** Tulis satu baris atlet pada area config (tanpa menyentuh area lain). */
async function upsertRegistration(cfg, state, dryRun = false) {
  if (!state) return { outcome: "DELETED", note: "registration hilang" };
  const { wb, ws, cols, records } = await readWorkbookRecords(cfg);
  const key = normKey(state.name);
  const existing = records.find((rec) => rec.key === key);

  if (!dryRun) await markProcessing();

  if (existing) {
    // Duplicate protection: sudah ada.
    const incompleteFix = cfg.duplicate_strategy === "update_empty_fields";
    let changed = false;
    for (const field of ["ku", "gender", "birth_date"]) {
      const col = cols[field];
      if (!col || !incompleteFix) continue;
      const cur = existing.values[field];
      const want = field === "ku" ? kuShort(state.ku) : field === "gender" ? state.gender : state.birth_date;
      if (!cur && want) { ws.getCell(existing.row, col).value = want; changed = true; }
      else if (cur && want && cur.replace(/\s+/g, "") !== want.replace(/\s+/g, "")) {
        return { outcome: "REVIEW_REQUIRED", note: `DATA_MISMATCH ${field} @r${existing.row}: excel="${cur}" db="${want}"` };
      }
    }
    if (!dryRun) {
      if (changed) await wb.xlsx.writeFile(cfg.file_path);
      await db.from("excel_sync_row_mappings").upsert({
        configuration_id: cfg.id, registration_id: state.registration_id,
        athlete_id: state.athlete_id, excel_row: existing.row,
        athlete_key: key, athlete_name: state.name,
        synced_values: state, updated_at: new Date().toISOString(),
      }, { onConflict: "configuration_id,registration_id" });
    }
    return { outcome: changed ? "UPDATED" : "SKIPPED_EXISTING", row: existing.row };
  }

  // Tidak ada → cari slot kosong pertama dalam area (atau append bila max_row null).
  const lastRow = cfg.max_row ?? Math.max(ws.rowCount, cfg.first_data_row);
  let target = null;
  for (let r = cfg.first_data_row; r <= lastRow; r++) {
    const occupied = cols.name && normKey(cellText(ws.getCell(r, cols.name)));
    if (!occupied) { target = r; break; }
  }
  if (target === null) {
    if (cfg.max_row) return { outcome: "REVIEW_REQUIRED", note: `AREA_FULL: tidak ada slot kosong sampai r${cfg.max_row}` };
    target = lastRow + 1;
  }
  // NO = nomor urut berikutnya (maksimum existing + 1)
  const noCol = cols.no;
  let nextNo = 1;
  if (noCol) {
    for (const rec of records) {
      const n = parseInt(rec.values.no, 10);
      if (!Number.isNaN(n)) nextNo = Math.max(nextNo, n + 1);
    }
  }
  if (!dryRun) {
    if (noCol) ws.getCell(target, noCol).value = nextNo;
    if (cols.ku) ws.getCell(target, cols.ku).value = kuShort(state.ku) || "DATA INCOMPLETE";
    if (cols.gender) ws.getCell(target, cols.gender).value = state.gender || "DATA INCOMPLETE";
    if (cols.name) ws.getCell(target, cols.name).value = state.name;
    if (cols.birth_date) ws.getCell(target, cols.birth_date).value = state.birth_date || "DATA INCOMPLETE";
    await wb.xlsx.writeFile(cfg.file_path);
    await db.from("excel_sync_row_mappings").upsert({
      configuration_id: cfg.id, registration_id: state.registration_id,
      athlete_id: state.athlete_id, excel_row: target,
      athlete_key: key, athlete_name: state.name,
      synced_values: state, updated_at: new Date().toISOString(),
    }, { onConflict: "configuration_id,registration_id" });
  }
  return { outcome: "INSERTED", row: target };
}

/** Hapus baris berdasarkan mapping stabil (config+registration) ATAU snapshot
 *  payload (untuk cleanup pasca permanent-delete event yang config-nya sudah CASCADE). */
async function deleteRegistration(cfg, registrationId, dryRun = false, snap = null) {
  let map = null;
  const { data: liveMap } = await db.from("excel_sync_row_mappings")
    .select("*").eq("configuration_id", cfg.id).eq("registration_id", registrationId).maybeSingle();
  map = liveMap;

  // Snapshot path: baris Excel diketahui dari payload (mapping DB sudah ikut terhapus).
  if (!map && snap && Number.isInteger(snap.excel_row)) {
    map = { id: null, excel_row: snap.excel_row, athlete_key: snap.athlete_key ?? null };
  }
  if (!map) return { outcome: "SKIPPED_NO_MAPPING", note: "tidak ada mapping stabil — tidak melakukan destructive delete" };

  const { wb, ws, cols } = await readWorkbookRecords(cfg);
  const rowName = cols.name && normKey(cellText(ws.getCell(map.excel_row, cols.name)));
  if (rowName && map.athlete_key && rowName !== map.athlete_key) {
    return { outcome: "REVIEW_REQUIRED", note: `mapping r${map.excel_row} berisi nama lain sekarang` };
  }
  if (!dryRun) {
    for (const col of Object.values(cols)) {
      if (col) ws.getCell(map.excel_row, col).value = null;   // kosongkan sel area saja
    }
    await wb.xlsx.writeFile(cfg.file_path);
    if (map.id) await db.from("excel_sync_row_mappings").delete().eq("id", map.id);
  }
  return { outcome: "DELETED", row: map.excel_row };
}

// ---------- job lifecycle ----------
async function markProcessing() {}

async function runJob(job) {
  const { data: cfg } = await db.from("excel_sync_configurations").select("*").eq("id", job.configuration_id).maybeSingle();

  await db.from("excel_sync_jobs").update({ status: "PROCESSING", updated_at: new Date().toISOString() }).eq("id", job.id);

  const snap = job.payload?.snapshot ?? null;
  // Cleanup pasca PERMANENT DELETE event: operasi delete sudah dikomit
  // saat config masih aktif, jadi job harus tuntas meski config kini
  // hilang (CASCADE) atau global dimatikan setelahnya.
  const isEventCleanup = job.action === "delete_registration" && job.payload?.reason === "EVENT_PERMANENT_DELETED";
  // Diagnostik tetap boleh jalan walau sync OFF — justru untuk memeriksa kesiapan.
  const isDiagnostic = job.action === "test_connection" || job.action === "dry_run";

  let effCfg = cfg;
  if (!effCfg && isEventCleanup && snap?.file_path) {
    effCfg = {
      id: cfg?.id ?? null, event_id: null,
      file_path: snap.file_path, worksheet_name: snap.worksheet_name,
      header_row: snap.header_row, first_data_row: snap.first_data_row,
      max_row: snap.max_row, mapping: snap.mapping,
    };
  }
  if (!effCfg) return finish(job, "SKIPPED_DISABLED", null, "konfigurasi hilang");
  if (!isEventCleanup && !isDiagnostic && (!effCfg.enabled || !(await globalEnabled()))) {
    await syncLog("SYNC_SKIPPED_DISABLED", { configuration_id: effCfg.id, event_id: effCfg.event_id, detail: { job_id: job.id } });
    return finish(job, "SKIPPED_DISABLED", null, "sync disabled");
  }

  await syncLog("SYNC_STARTED", { configuration_id: effCfg.id, event_id: effCfg.event_id, detail: { job_id: job.id, action: job.action } });

  try {
    let result;
    if (job.action === "test_connection") {
      const check = await testConnection(effCfg);
      await db.from("excel_sync_configurations").update({
        last_check: check, last_check_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", effCfg.id);
      await syncLog(check.ok ? "TEST_CONNECTION_OK" : "TEST_CONNECTION_FAILED", {
        configuration_id: effCfg.id, event_id: effCfg.event_id,
        detail: { job_id: job.id, checks: check.checks }, error_message: check.error,
      });
      return finish(job, check.ok ? "SUCCESS" : "FAILED", check.error, check.ok ? "connection ok" : "connection failed");
    }
    if (job.action === "dry_run") {
      const dry = await dryRunConfig(effCfg);
      await db.from("excel_sync_configurations").update({
        last_dry_run: dry.summary, last_dry_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", effCfg.id);
      await syncLog(dry.ok ? "DRY_RUN_OK" : "DRY_RUN_REVIEW", {
        configuration_id: effCfg.id, event_id: effCfg.event_id,
        detail: { job_id: job.id, summary: dry.summary }, error_message: null,
      });
      return finish(job, "SUCCESS", null, `insert=${dry.summary.insert} update=${dry.summary.update} skip=${dry.summary.skip} review=${dry.summary.review_required}`);
    }
    if (job.action === "delete_registration") {
      result = await deleteRegistration(effCfg, job.registration_id, false, snap);
    } else if (job.action === "reconcile") {
      result = await reconcile(effCfg);
    } else {
      const state = await fetchCurrentState(job.registration_id);
      result = state ? await upsertRegistration(cfg, state) : { outcome: "DELETED", note: "reg terhapus di DB" };
    }

    const logAction =
      result.outcome === "REVIEW_REQUIRED" ? "SYNC_REVIEW_REQUIRED" :
      job.action === "reconcile" ? "SYNC_RECONCILED" : "SYNC_SUCCESS";

    const status = result.outcome === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "SUCCESS";
    await finish(job, status, null, result.note ?? result.outcome);
    await syncLog(logAction, {
      configuration_id: effCfg.id, event_id: effCfg.event_id, registration_id: job.registration_id, athlete_id: job.athlete_id,
      detail: { outcome: result.outcome, row: result.row ?? null, summary: result.summary ?? null },
      error_message: result.note ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retry = job.retry_count + 1;
    if (/EBUSY|EPERM|EACCES|locked/i.test(msg) && retry <= MAX_RETRY) {
      await db.from("excel_sync_jobs").update({
        status: "RETRYING", retry_count: retry, last_error: msg, updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      await syncLog("SYNC_RETRY", { configuration_id: effCfg.id, event_id: effCfg.event_id, detail: { job_id: job.id, retry }, error_message: msg });
    } else {
      await finish(job, "FAILED", msg, null);
      await syncLog("SYNC_FAILED", { configuration_id: effCfg.id, event_id: effCfg.event_id, detail: { job_id: job.id }, error_message: msg });
    }
  }
}

async function finish(job, status, error, note) {
  await db.from("excel_sync_jobs").update({
    status, last_error: error ?? note ?? null, processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", job.id);
}

/** Reconcile: bandingkan DB vs Excel untuk seluruh registrasi event config ini. */
async function reconcile(cfg) {
  const { data: regs } = await db.from("event_registrations")
    .select("id").eq("event_id", cfg.event_id).neq("status", "CANCELLED");
  const summary = { db_registrations: regs?.length ?? 0, inserted: 0, skipped_existing: 0, review: 0, errors: [] };
  for (const r of regs ?? []) {
    try {
      const state = await fetchCurrentState(r.id);
      const res = await upsertRegistration(cfg, state, true);
      if (res.outcome === "INSERTED" || res.outcome === "UPDATED") summary.inserted++;
      else if (res.outcome === "REVIEW_REQUIRED") summary.review++;
      else summary.skipped_existing++;
    } catch (e) {
      summary.errors.push(`${r.id}: ${e.message}`);
      if (summary.errors.length >= 5) break;
    }
  }
  return { outcome: summary.review > 0 ? "REVIEW_REQUIRED" : "OK", summary };
}

/** TEST CONNECTION: file ada? worksheet ada? area valid? writable?
 *  Tidak pernah mengubah file. */
async function testConnection(cfg) {
  const result = { ok: false, checks: {}, error: null };
  try {
    const st = await statFile(cfg.file_path);
    result.checks.file_exists = true;
    result.checks.size_bytes = st.size;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(cfg.file_path);
    result.checks.readable = true;
    const ws = wb.getWorksheet(cfg.worksheet_name);
    if (!ws) throw Object.assign(new Error(`Worksheet \"${cfg.worksheet_name}\" tidak ditemukan`), { code: "WORKSHEET_MISSING" });
    result.checks.worksheet = true;
    result.checks.header_row = cfg.header_row;
    const hdr = ws.getCell(cfg.header_row, 1).value;
    result.checks.header_sample = typeof hdr === "object" && hdr?.richText ? hdr.richText.map((r) => r.text).join("") : String(hdr ?? "");
    // Writable test di file SEMENTARA — file asli tidak disentuh.
    const tmp = `${cfg.file_path}.writetest-${Date.now()}.tmp`;
    try {
      await new ExcelJS.Workbook().xlsx.writeFile(tmp);
      result.checks.writable_dir = true;
    } finally {
      await rmFile(tmp);
    }
    result.ok = true;
  } catch (e) {
    result.error = e.message;
    if (/ENOENT|EPERM|EACCES/.test(String(e.message))) result.checks.file_exists = false;
    if (e.code === "WORKSHEET_MISSING") result.checks.worksheet = false;
  }
  return result;
}

/** DRY RUN: hitung INSERT/UPDATE/SKIP/REVIEW tanpa menulis apa pun. */
async function dryRunConfig(cfg) {
  const { data: regs } = await db.from("event_registrations")
    .select("id").eq("event_id", cfg.event_id).neq("status", "CANCELLED");
  const summary = { db_registrations: regs?.length ?? 0, insert: 0, update: 0, skip: 0, review_required: 0, mismatch: [], notes: [] };
  for (const r of regs ?? []) {
    try {
      const state = await fetchCurrentState(r.id);
      const res = state ? await upsertRegistration(cfg, state, true) : { outcome: "SKIP", note: "reg hilang" };
      if (res.outcome === "INSERTED") summary.insert++;
      else if (res.outcome === "UPDATED") summary.update++;
      else if (res.outcome === "REVIEW_REQUIRED") {
        summary.review_required++;
        summary.mismatch.push(res.note);
        if (summary.mismatch.length >= 5) summary.mismatch.push("…");
      } else summary.skip++;
    } catch (e) {
      summary.notes.push(`${e.message}`);
      if (summary.notes.length >= 3) break;
    }
  }
  return { ok: summary.notes.length === 0, summary };
}

// ---------- main loop ----------
async function tick() {
  const job = await claimJob();
  if (job) {
    log(`job #${job.id} action=${job.action} cfg=${job.configuration_id} reg=${job.registration_id ?? "-"} attempt=${job.retry_count + 1}`);
    await runJob(job);
  }
}

let running = true;
process.on("SIGINT", () => { running = false; console.log("\n[worker] berhenti setelah iterasi ini"); });

log(`start — poll=${POLL_MS}ms`);
await heartbeat();
while (running) {
  try {
    await tick();
    await heartbeat();
  } catch (e) {
    log("tick error:", e.message);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
process.exit(0);
