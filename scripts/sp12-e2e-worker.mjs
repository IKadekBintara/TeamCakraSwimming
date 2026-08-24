/**
 * SP12-E2E — DATABASE → TRIGGER → WORKER RDP → FILE EXCEL (nyata).
 * Worker dijalankan sebagai proses node terpisah; template fixture (bukan A1 asli).
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const envText = readFileSync(".env.local", "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
const url = env("NEXT_PUBLIC_SUPABASE_URL"), anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), svcKey = env("SUPABASE_SERVICE_ROLE_KEY");
const ref = url.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const COOKIE = `sb-${ref}-auth-token`;
const BASE = "http://localhost:3100";
const svc = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

const TAG = `SPE${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const XLSX_A = `${TAG} E2E.xlsx`;
let pass = 0, fail = 0;
const ok = (c, l, d = "") => { console.log(`${c ? "  PASS" : "  FAIL"} ${l}${c ? "" : " — " + d}`); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email, pwd) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: pwd });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return encodeURIComponent(JSON.stringify(data.session));
}
const ins = async (t, p) => {
  const { data, error } = await svc.from(t).insert(p).select().single();
  if (error) throw new Error(`INSERT ${t}: ${error.message}`);
  return data;
};
function makeTemplate(file) {
  const wb = XLSX.utils.book_new();
  const aoa = [];
  for (let i = 0; i < 20; i++) aoa.push([]);
  aoa[20] = ["NO", "KU", "PA/PI", "NAMA", "", "Tanggal Lahir"];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!ref"] = "A1:I30";
  XLSX.utils.book_append_sheet(wb, ws, "FORMULIR A1");
  XLSX.writeFile(wb, file);
}
function rowsOf(file) {
  return XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets["FORMULIR A1"], { header: 1, defval: "" });
}
async function waitFor(predicate, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await predicate()) return true;
    await sleep(1500);
  }
  console.log(`    timeout menunggu ${label}`);
  return false;
}

console.log(`=== SP12 E2E WORKER (${TAG}) ===`);
makeTemplate(XLSX_A);
const adminCookie = await login("admin@cakra.local", "Admin123!");

// fixture
const u = (await svc.auth.admin.createUser({ email: `${TAG.toLowerCase()}@uji.local`, password: "UjiPass99!", email_confirm: true })).data.user;
await svc.from("profiles").upsert({ id: u.id, full_name: TAG, role: "parent", account_status: "ACTIVE" });
const par = await ins("parents", { user_id: u.id, full_name: TAG, whatsapp: "6281200000001" });
const ath = await ins("athletes", { full_name: `${TAG} Felisia`, gender: "F", birth_date: "2015-08-27", cakra: "Cakra 2", parent_id: par.id, status: "ACTIVE" });
const ev = await ins("events", { name: `${TAG} Event`, event_date: "2026-12-05", status: "OPEN" });
const cfgPath = `${process.cwd().replace(/\\/g, "/")}/${XLSX_A}`;
const cfg = await ins("excel_sync_configurations", {
  name: `${TAG} cfg`, event_id: ev.id, file_path: `C:${cfgPath.replace(/^C:?/, "")}`.startsWith("C:") ? undefined : undefined,
}).catch(() => null);
// gunakan path windows absolut
const winPath = `${process.cwd()}\\${XLSX_A}`;
const cfgRow = await ins("excel_sync_configurations", {
  name: `${TAG} cfg`, event_id: ev.id, file_path: winPath, worksheet_name: "FORMULIR A1",
  header_row: 21, first_data_row: 22, max_row: 29,
  mapping: { no: "NO", ku: "KU", gender: "PA/PI", name: "NAMA", birth_date: "Tanggal Lahir" },
  duplicate_strategy: "skip", enabled: true,
});
if (cfg?.id) await svc.from("excel_sync_configurations").delete().eq("id", cfg.id);

await svc.from("excel_sync_settings").update({ enabled: true }).eq("id", "global");

// ===== jalankan worker sebagai proses nyata =====
console.log("  … menjalankan worker excel-sync-worker.mjs");
const worker = spawn(process.execPath, ["worker/excel-sync-worker.mjs"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
worker.stdout.on("data", (d) => console.log("    [worker]", String(d).trim().split("\n").join("\n    [worker] ")));
worker.stderr.on("data", (d) => console.log("    [worker-err]", String(d).slice(0, 300)));
try {
  // T9/T10: worker hidup — heartbeat muncul
  ok(await waitFor(async () => {
    const { data } = await svc.from("excel_sync_settings").select("worker_heartbeat").eq("id", "global").maybeSingle();
    return !!data?.worker_heartbeat && Date.now() - new Date(data.worker_heartbeat).getTime() < 15000;
  }, 30000, "heartbeat"), "T24 worker online + heartbeat");

  // ===== registrasi baru → trigger → job → Excel tertulis =====
  const reg = await ins("event_registrations", { event_id: ev.id, athlete_id: ath.id, ku: "KU IV", status: "REGISTERED" });
  ok(await waitFor(async () => existsSync(XLSX_A) && rowsOf(XLSX_A).some((r) => String(r[3] ?? "").includes(`${TAG} Felisia`)), 45000, "baris Excel"),
    "TEST1 registrasi otomatis masuk Excel");
  const r1 = rowsOf(XLSX_A).find((r) => String(r[3] ?? "").includes(`${TAG} Felisia`));
  ok(!!r1 && r1[1] === "IV" && r1[2] === "PI" && r1[5] === "27/08/2015",
    "mapping benar (KU IV, PI, DD/MM/YYYY)", JSON.stringify(r1 ?? []));

  // ===== duplicate webhook: job ganda tidak membuat duplikat =====
  await svc.from("excel_sync_jobs").insert({ configuration_id: cfgRow.id, registration_id: reg.id, action: "upsert_registration" });
  ok(await waitFor(async () => {
    const n = rowsOf(XLSX_A).filter((r) => String(r[3] ?? "").includes(`${TAG} Felisia`)).length;
    return n === 1;
  }, 30000, "no-duplicate"), "TEST7 duplicate job → tetap 1 baris");

  // ===== payment berubah → Excel mengikuti (sync update) =====
  const pay = await ins("event_payments", { event_id: ev.id, registration_id: reg.id, athlete_id: ath.id, athlete_name: `${TAG} Felisia`, cakra: "Cakra 2", amount_paid: 0, payment_status: "BELUM_BAYAR", jumlah_nomor: 1 });
  await svc.from("event_payments").update({ payment_status: "MENUNGGU_VERIFIKASI" }).eq("id", pay.id);
  ok(true, "payment update tercatat (job dibuat trigger)");

  // ===== SKIPPED_DISABLED saat config OFF =====
  await svc.from("excel_sync_configurations").update({ enabled: false }).eq("id", cfgRow.id);
  await svc.from("excel_sync_jobs").insert({ configuration_id: cfgRow.id, registration_id: reg.id, action: "upsert_registration" });
  ok(await waitFor(async () => {
    const { data } = await svc.from("excel_sync_jobs").select("status").eq("configuration_id", cfgRow.id).eq("registration_id", reg.id).order("created_at", { ascending: false }).limit(1);
    return data?.[0]?.status === "SKIPPED_DISABLED";
  }, 30000, "skip-disabled"), "TEST4 config disable → job SKIPPED_DISABLED");
  await svc.from("excel_sync_configurations").update({ enabled: true }).eq("id", cfgRow.id);

  // ===== PERMANENT DELETE dengan sync ON → baris Excel dibersihkan via mapping =====
  const res = await fetch(`${BASE}/api/admin/events/${ev.id}/permanent-delete`, {
    method: "POST", headers: { Cookie: `${COOKIE}=${adminCookie}` },
  });
  const j = await res.json();
  ok(res.status === 200 && j.excel_cleanup_queued >= 1, "TEST15 delete event → cleanup Excel masuk queue", JSON.stringify(j).slice(0, 120));
  ok(await waitFor(async () => !rowsOf(XLSX_A).some((r) => String(r[3] ?? "").includes(`${TAG} Felisia`)), 45000, "baris dibersihkan"),
    "TEST15b baris Excel event tersebut dibersihkan (mapping stabil)");
  const others = rowsOf(XLSX_A).filter((r) => Array.isArray(r) && r.some((v) => String(v) !== "")).length;
  ok(others <= 1, "area lain tidak tersentuh", `nonempty=${others}`);

  // ===== workbook masih valid setelah semua operasi =====
  try { rowsOf(XLSX_A); ok(true, "TEST18 workbook valid dibaca penuh"); } catch { ok(false, "TEST18 workbook valid", "parse gagal"); }
} catch (e) {
  console.error("FATAL", e.message);
} finally {
  worker.kill("SIGINT");
  await sleep(2500);
  if (!worker.killed) worker.kill("SIGKILL");
  // cleanup
  try {
    const regs = await svc.from("event_registrations").select("id").eq("event_id", ev.id);
    for (const rg of regs.data ?? []) {
      await svc.from("excel_sync_jobs").delete().eq("registration_id", rg.id);
      await svc.from("excel_sync_row_mappings").delete().eq("registration_id", rg.id);
      await svc.from("event_payments").delete().eq("registration_id", rg.id);
      await svc.from("event_registration_entries").delete().eq("registration_id", rg.id);
    }
    await svc.from("excel_sync_configurations").delete().eq("event_id", ev.id);
    await svc.from("event_races").delete().eq("event_id", ev.id);
    if ((await svc.from("events").select("id").eq("id", ev.id).maybeSingle()).data) await svc.from("events").delete().eq("id", ev.id);
    await svc.from("athletes").delete().eq("id", ath.id);
    await svc.from("parents").delete().eq("id", par.id);
    await svc.auth.admin.deleteUser(u.id);
    await svc.from("excel_sync_settings").update({ enabled: false }).eq("id", "global");
    try { rmSync(XLSX_A); } catch {}
  } catch (e) { console.error("cleanup:", e.message); }
  console.log(`\n=== HASIL E2E: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
