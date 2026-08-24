/** E2E Excel Sync diagnostik: buat config QA → worker → test_connection + dry_run → lapor → bersihkan. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });

const EVENT_ID = process.argv[2];
if (!EVENT_ID) { console.error("usage: node sp14-diag-e2e.mjs <event_id>"); process.exit(1); }

// 1) Config QA (enabled=false supaya tidak memicu sync nyata; diagnostik tetap jalan)
const { data: cfg, error: e1 } = await db.from("excel_sync_configurations").insert({
  name: "[QA-DIAG] Dolphin → A1",
  event_id: EVENT_ID,
  file_path: "C:\\Users\\kadexagent\\Documents\\atlet cakra\\FORMULIR PENDAFTARAN A1.xlsx",
  worksheet_name: "FORMULIR A1",
  header_row: 21, first_data_row: 22, max_row: 29,
  mapping: { no: "NO", ku: "KU", gender: "PA/PI", name: "NAMA", birth_date: "Tanggal Lahir" },
  duplicate_strategy: "skip",
  enabled: false,
}).select().single();
if (e1) throw e1;
console.log("cfg:", cfg.id);

// 2) Enqueue kedua job
for (const action of ["test_connection", "dry_run"]) {
  const { error } = await db.from("excel_sync_jobs").insert({
    configuration_id: cfg.id, action, payload: { trigger: "qa_diag" },
  });
  if (error) throw error;
}
console.log("queued: test_connection, dry_run");

// 3) Poll hasil (maks 60s)
let done = false;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const { data: c } = await db.from("excel_sync_configurations").select("last_check, last_check_at, last_dry_run, last_dry_run_at").eq("id", cfg.id).single();
  if (c?.last_check && c?.last_dry_run) {
    console.log("TEST_CONNECTION:", JSON.stringify(c.last_check));
    console.log("DRY_RUN:", JSON.stringify(c.last_dry_run));
    done = true;
    break;
  }
}
console.log(done ? "DIAG OK" : "TIMEOUT menunggu hasil");

// 4) Cleanup config QA
await db.from("excel_sync_configurations").delete().eq("id", cfg.id);
console.log("cleanup ok");
