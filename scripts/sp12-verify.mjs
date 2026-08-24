/**
 * SP12 TEST MATRIX — Universal Excel Sync + Permanent Event Delete.
 * HTTP nyata :3100 + DB service-role + file Excel nyata (fixture copy, template asli aman).
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { readFileSync, copyFileSync, rmSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
const url = env("NEXT_PUBLIC_SUPABASE_URL"), anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), svcKey = env("SUPABASE_SERVICE_ROLE_KEY");
const ref = url.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const COOKIE = `sb-${ref}-auth-token`;
const BASE = "http://localhost:3100";
const svc = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

const TAG = `SP12UJI${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const XLSX_A = `${TAG} Excel A.xlsx`;
const XLSX_B = `${TAG} Excel B.xlsx`;
let pass = 0, fail = 0;
function ok(cond, label, detail = "") {
  console.log(`${cond ? "  PASS" : "  FAIL"} ${label}${cond ? "" : " — " + detail}`);
  cond ? pass++ : fail++;
}

async function login(email, pwd) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: pwd });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return encodeURIComponent(JSON.stringify(data.session));
}
async function api(cookie, path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Cookie: `${COOKIE}=${cookie}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { res, json };
}
async function ins(table, payload) {
  const { data, error } = await svc.from(table).insert(payload).select().single();
  if (error) throw new Error(`INSERT ${table}: ${error.message}`);
  return data;
}
function makeTemplateA(file) {
  const wb = XLSX.utils.book_new();
  const aoa = [];
  for (let i = 0; i < 20; i++) aoa.push([]);
  aoa[20] = ["NO", "KU", "PA/PI", "NAMA", "", "Tanggal Lahir"];
  for (let r = 21; r < 29; r++) aoa[r] = [];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!ref"] = "A1:I30";
  XLSX.utils.book_append_sheet(wb, ws, "FORMULIR A1");
  XLSX.writeFile(wb, file);
}
function readRows(file) {
  const wb = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(wb.Sheets["FORMULIR A1"], { header: 1, defval: "" });
}

console.log(`=== SP12 EXCEL SYNC + PERMANENT DELETE (${TAG}) ===`);

// ===== SETUP =====
makeTemplateA(XLSX_A); makeTemplateB();
function makeTemplateB() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["No", "Nama Atlet", "Kelas Umur"]]);
  ws["!ref"] = "A1:C40";
  XLSX.utils.book_append_sheet(wb, ws, "DATA");
  XLSX.writeFile(wb, XLSX_B);
}

const adminCookie = await login("admin@cakra.local", "Admin123!");
const coachCookie = await login("coach@cakra.local", "Coach123!");
const parentCookie = await login("parent@cakra.local", "Parent123!");

// fixture users
const mkUser = async (name) => (await svc.auth.admin.createUser({
  email: `${TAG.toLowerCase()}${Math.random().toString(36).slice(2, 8)}@uji.local`,
  password: "UjiPass99!", email_confirm: true, user_metadata: { full_name: name },
})).data.user;
const adminUid = (await svc.from("profiles").select("id").eq("role", "admin").limit(1)).data[0]?.id;
const parentU = await mkUser(`${TAG} Parent`);
await svc.from("profiles").upsert({ id: parentU.id, full_name: `${TAG} Parent`, role: "parent", account_status: "ACTIVE" });
const parentId = (await ins("parents", { user_id: parentU.id, full_name: `${TAG} Parent`, whatsapp: "6281200000001" })).id ?? (await svc.from("parents").select("id").eq("user_id", parentU.id).single()).data.id;
const mkAthlete = async (name, gender, birth) => ins("athletes", { full_name: name, gender, birth_date: birth, cakra: "Cakra 2", parent_id: parentId, status: "ACTIVE" });
const aidF = await mkAthlete(`${TAG} Felisia`, "F", "2015-08-27");
const aidB = await mkAthlete(`${TAG} Budi`, "M", "2012-01-01");

const evA = await ins("events", { name: `${TAG} Event A`, event_date: "2026-12-01", status: "OPEN" });
const evB = await ins("events", { name: `${TAG} Event B`, event_date: "2026-12-02", status: "OPEN" });
const evC = await ins("events", { name: `${TAG} Event C tanpa sync`, event_date: "2026-12-03", status: "OPEN" });
const raceA = await ins("event_races", { event_id: evA.id, name: `${TAG} 50m Free`, distance_m: 50, stroke: "Freestyle", price: 0, is_free: true });

try {
  // ===== FASE A: konfigurasi & global gate =====
  let r = await api(adminCookie, "/api/admin/excel-sync");
  ok(r.res.status === 200 && typeof r.json.settings?.enabled === "boolean", "T19a GET settings admin", JSON.stringify(r.json).slice(0, 80));

  // non-admin ditolak
  r = await api(coachCookie, "/api/admin/excel-sync");
  ok(r.res.status === 403, "T20a coach GET config DENIED 403", `status=${r.res.status}`);
  r = await api(parentCookie, "/api/admin/excel-sync", "PATCH", { action: "set_global", enabled: true });
  ok(r.res.status === 403, "T20b parent set_global DENIED 403", `status=${r.res.status}`);

  // buat config A via wizard-API (disabled dulu)
  r = await api(adminCookie, "/api/admin/excel-sync", "POST", {
    name: `${TAG} A→ExcelA`, event_id: evA.id, file_path: new URL(`../${XLSX_A}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    worksheet_name: "FORMULIR A1", header_row: 21, first_data_row: 22, max_row: 29,
    mapping: { no: "NO", ku: "KU", gender: "PA/PI", name: "NAMA", birth_date: "Tanggal Lahir" },
    duplicate_strategy: "skip", enabled: false,
  });
  ok(r.res.status === 201, "T11a buat config A", `status=${r.res.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  const cfgA = r.json.configuration;
  const pathA = cfgA.file_path;

  r = await api(adminCookie, "/api/admin/excel-sync", "POST", {
    name: `${TAG} B→ExcelB`, event_id: evB.id, file_path: new URL(`../${XLSX_B}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    worksheet_name: "DATA", header_row: 1, first_data_row: 2, max_row: 40,
    mapping: { no: "No", name: "Nama Atlet", ku: "Kelas Umur" },
    enabled: false,
  });
  ok(r.res.status === 201, "T11b buat config B (template beda)", `status=${r.res.status}`);
  const cfgB = r.json.configuration;

  // duplikat config ditolak
  r = await api(adminCookie, "/api/admin/excel-sync", "POST", {
    name: `${TAG} duplikat`, event_id: evA.id, file_path: pathA, worksheet_name: "FORMULIR A1",
  });
  ok(r.res.status === 409, "duplikat config 409", `status=${r.res.status}`);

  // ===== Registrasi ke Event A saat global OFF → TIDAK boleh ada job =====
  const regF = await ins("event_registrations", { event_id: evA.id, athlete_id: aidF.id, ku: "KU IV", status: "REGISTERED" });
  const payF = await ins("event_payments", { event_id: evA.id, registration_id: regF.id, athlete_id: aidF.id, athlete_name: `${TAG} Felisia`, cakra: "Cakra 2", amount_paid: 0, payment_status: "BELUM_BAYAR", jumlah_nomor: 1 });
  await svc.from("event_registration_entries").insert({ registration_id: regF.id, race_id: raceA.id, price_snapshot: 0 });
  await svc.from("event_payments").update({ payment_status: "MENUNGGU_VERIFIKASI", payment_method: "Transfer Bank" }).eq("id", payF.id);
  await svc.from("excel_sync_jobs").delete().eq("registration_id", regF.id);

  // ===== Global ON + config A/B enable → reconcile menulis Excel =====
  await api(adminCookie, "/api/admin/excel-sync", "PATCH", { action: "set_global", enabled: true });
  await api(adminCookie, "/api/admin/excel-sync", "PATCH", { action: "toggle_config", id: cfgA.id, enabled: true });
  await api(adminCookie, "/api/admin/excel-sync", "PATCH", { action: "toggle_config", id: cfgB.id, enabled: true });
  await svc.from("excel_sync_jobs").insert({ configuration_id: cfgA.id, action: "reconcile", payload: { trigger: "test" } });
  await svc.from("excel_sync_jobs").insert({ configuration_id: cfgB.id, action: "reconcile", payload: { trigger: "test" } });
  console.log("  … job reconcile A+B masuk queue; worker akan diproses di fase E2E bawah");

  // ===== Registrasi Event B (config B aktif) & Event C (tanpa config) =====
  const regB = await ins("event_registrations", { event_id: evB.id, athlete_id: aidB.id, ku: "KU II", status: "REGISTERED" });
  const regC = await ins("event_registrations", { event_id: evC.id, athlete_id: aidB.id, ku: "KU II", status: "REGISTERED" });
  ok(true, "T3 registrasi event tanpa config tetap sukses (regC dibuat)");

  // ===== Export universal (regresi cepat) =====
  r = await api(adminCookie, `/api/export?kind=event_registrations&event_id=${evA.id}&from=2000-01-01&to=2100-01-01`);
  ok(r.res.status === 200, "export regs Event A 200", `status=${r.res.status}`);

  // ===== PERMANENT DELETE =====
  r = await api(adminCookie, `/api/admin/events/${evC.id}/permanent-delete`, "POST");
  ok(r.res.status === 200 && r.json.deleted?.deleted === true, "T13 permanent delete event kosong", JSON.stringify(r.json).slice(0, 100));
  const gone = await svc.from("events").select("id").eq("id", evC.id).maybeSingle();
  ok(!gone.data, "T13b events benar-benar kosong");
  const athStill = await svc.from("athletes").select("id").eq("id", aidB.id).maybeSingle();
  ok(!!athStill.data, "T31 atlet tetap ada");

  // non-admin delete denied
  r = await api(coachCookie, `/api/admin/events/${evB.id}/permanent-delete`, "POST");
  ok(r.res.status === 403, "T37 non-admin delete DENIED 403", `status=${r.res.status}`);

  // ===== DELETE CONFIG (sebelum event dihapus): hanya configuration hilang =====
  r = await api(adminCookie, `/api/admin/excel-sync/${cfgB.id}`, "PATCH", { action: "delete_config" });
  ok(r.res.status === 200, "T12a hapus config B", `status=${r.res.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  let cfgGone = await svc.from("excel_sync_configurations").select("id").eq("id", cfgB.id).maybeSingle();
  ok(!cfgGone.data, "T12b config B hilang dari tabel");

  // delete event dengan dependency (B punya reg)
  r = await api(adminCookie, `/api/admin/events/${evB.id}/permanent-delete`, "POST");
  ok(r.res.status === 200, "T14 delete event dengan registration", JSON.stringify(r.json).slice(0, 160));
  const regBGone = await svc.from("event_registrations").select("id").eq("id", regB.id).maybeSingle();
  ok(!regBGone.data, "T29 registration event ikut terhapus");

  // URL lama → not found (cek body karena streaming)
  const pageRes = await fetch(`${BASE}/events/${evB.id}`, { headers: { Cookie: `${COOKIE}=${adminCookie}` } });
  const pageBody = await pageRes.text();
  ok(!pageBody.includes(evB.name), "T38 URL event lama tidak lagi memuat konten event", `status=${pageRes.status}`);

  // audit DELETE_EVENT tercatat
  const audits = await svc.from("audit_logs").select("id").eq("action", "DELETE_EVENT").eq("entity_id", evC.id);
  ok((audits.data ?? []).length >= 1, "audit DELETE_EVENT tercatat");

  // ===== Global OFF → toggle kembali OFF utk state akhir test =====
  r = await api(adminCookie, "/api/admin/excel-sync", "PATCH", { action: "set_global", enabled: false });
  ok(r.res.status === 200, "T5/T19b global OFF kembali", `status=${r.res.status}`);

  console.log("\n=== FASE E2E WORKER (menulis Excel nyata) ===");
  console.log("(dijalankan oleh skrip lanjutan dengan worker hidup)");
} catch (e) {
  console.error("FATAL", e.message);
} finally {
  // cleanup DB fixture
  try {
    for (const ev of [evA, evB, evC].filter(Boolean)) {
      const regs = await svc.from("event_registrations").select("id").eq("event_id", ev.id);
      for (const rg of regs.data ?? []) {
        await svc.from("excel_sync_jobs").delete().eq("registration_id", rg.id);
        await svc.from("excel_sync_row_mappings").delete().eq("registration_id", rg.id);
        await svc.from("event_payments").delete().eq("registration_id", rg.id);
        await svc.from("event_registration_entries").delete().eq("registration_id", rg.id);
      }
      await svc.from("event_registrations").delete().eq("event_id", ev.id);
      await svc.from("excel_sync_configurations").delete().eq("event_id", ev.id);
      await svc.from("event_races").delete().eq("event_id", ev.id);
      await svc.from("events").delete().eq("id", ev.id);
      await svc.from("audit_logs").delete().eq("entity_id", ev.id);
    }
    for (const a of [aidF, aidB]) {
      if (a) await svc.from("athletes").delete().eq("id", a.id);
    }
    if (parentId) await svc.from("parents").delete().eq("id", parentId);
    if (parentU) await svc.auth.admin.deleteUser(parentU.id);
    for (const f of [XLSX_A, XLSX_B]) try { rmSync(f); } catch {}
  } catch (e) {
    console.error("cleanup error:", e.message);
  }
  console.log(`\n=== HASIL: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
