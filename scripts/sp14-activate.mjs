/** Aktivasi produksi: Global ON + strategy update_empty_fields + enqueue reconcile (via API admin). */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const db = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cfgId = process.argv[2];
if (!cfgId) throw new Error("usage: node scripts/sp14-activate.mjs <config_id>");

// 1) Global ON
const g = await db.from("excel_sync_settings").update({ enabled: true }).eq("id", "global").select().single();
console.log("GLOBAL:", g.data?.enabled);

// 2) Strategy update_empty_fields
const c = await db.from("excel_sync_configurations").update({ duplicate_strategy: "update_empty_fields" }).eq("id", cfgId).select().single();
console.log("STRATEGY:", c.data?.duplicate_strategy);

// 3) Enqueue reconcile job (worker akan memproses)
const job = await db.from("excel_sync_jobs").insert({ configuration_id: cfgId, action: "reconcile", payload: {} }).select().single();
console.log("JOB:", job.data?.id, job.data?.action);
