/** AUDIT ROW-LEVEL: Supabase ↔ Excel A1 asli (event Dolphin, config aktif).
 * Klasifikasi: MATCHED / MISSING_IN_EXCEL / EXTRA_IN_EXCEL / DUPLICATE_IN_EXCEL / DATA_MISMATCH.
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim() ?? "";
const svc = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });

const { data: cfgs } = await svc.from("excel_sync_configurations").select("*");
if (!cfgs?.length) { console.log("NO_CONFIG"); process.exit(0); }

for (const cfg of cfgs) {
  console.log(`\n=== CONFIG ${cfg.name} (${cfg.id}) event=${cfg.event_id} enabled=${cfg.enabled} ===`);
  const ev = (await svc.from("events").select("name, event_date, status").eq("id", cfg.event_id).maybeSingle()).data;
  console.log(`EVENT: ${ev?.name ?? "?"} | ${ev?.event_date ?? "?"} | status=${ev?.status ?? "?"}`);
  console.log(`FILE : ${cfg.file_path} | sheet=${cfg.worksheet_name} header_row=${cfg.header_row}`);

  // ---- DB side: registrations + entries + athlete profile
  const regs = (await svc.from("event_registrations").select("id, athlete_id, ku").eq("event_id", cfg.event_id)).data ?? [];
  const regIds = regs.map(r => r.id);
  const ents = regIds.length ? (await svc.from("event_registration_entries").select("registration_id, athlete_name, gender").in("registration_id", regIds)).data ?? [] : [];
  const athIds = [...new Set(regs.map(r => r.athlete_id).filter(Boolean))];
  const athletes = athIds.length ? (await svc.from("athletes").select("id, full_name, gender, birth_date, cakra").in("id", athIds)).data ?? [] : [];
  const athMap = new Map(athletes.map(a => [a.id, a]));
  const entByReg = new Map();
  for (const e of ents) { if (!entByReg.has(e.registration_id)) entByReg.set(e.registration_id, e); }

  // ---- mapping rows (stable identity)
  const maps = regIds.length ? (await svc.from("excel_sync_row_mappings").select("registration_id, excel_row").in("registration_id", regIds)).data ?? [] : [];
  const mapByReg = new Map(maps.map(m => [m.registration_id, m.excel_row]));

  // ---- Excel side: baca area peserta
  const wb = XLSX.readFile(cfg.file_path, { cellDates: false });
  const ws = wb.Sheets[cfg.worksheet_name];
  if (!ws) { console.log("WORKSHEET_MISSING"); continue; }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const h = cfg.header_row - 1;
  const colOf = {};
  ["no", "ku", "gender", "name", "birth_date"].forEach(k => {
    const label = cfg.mapping?.[k];
    if (label) colOf[k] = aoa[h].findIndex(c => String(c).trim() === String(label).trim());
  });
  const excelRows = [];
  for (let i = cfg.first_data_row - 1; i < Math.min(aoa.length, cfg.max_row); i++) {
    const r = aoa[i] ?? [];
    const name = String(r[colOf.name] ?? "").trim();
    if (!name) continue;
    excelRows.push({ row: i + 1, name, ku: String(r[colOf.ku] ?? "").trim(), gender: String(r[colOf.gender] ?? "").trim(), birth: String(r[colOf.birth_date] ?? "").trim() });
  }
  console.log(`DB registrations=${regs.length} | Excel participant rows=${excelRows.length} | row_mappings=${maps.length}`);

  // ---- klasifikasi
  const used = new Set();
  let matched = 0, mismatch = 0, missing = 0;
  const issues = [];
  for (const reg of regs) {
    const e = entByReg.get(reg.id);
    const a = reg.athlete_id ? athMap.get(reg.athlete_id) : undefined;
    const dbName = (e?.athlete_name || a?.full_name || "").trim().toLowerCase();
    const idx = excelRows.findIndex(x => !used.has(x.row) && x.name.toLowerCase() === dbName);
    if (idx === -1) { missing++; issues.push(`MISSING ${dbName || reg.id}`); continue; }
    used.add(excelRows[idx].row);
    const x = excelRows[idx];
    const dbKu = String((reg.ku || a?.cakra || "").replace(/^KU\s*/i, "")).trim();
    const xKu = x.ku.replace(/^KU\s*/i, "").trim();
    const dbG = ((e?.gender || a?.gender || "") + "").trim();
    const xG = x.gender.trim();
    const expG = dbG === "F" ? "PI" : dbG === "M" ? "PA" : "";
    const dbBirth = a?.birth_date ? String(a.birth_date).slice(0, 10).split("-").reverse().join("/") : "";
    const norm = s => s.replace(/\D/g, "");
    const diffs = [];
    if (xKu !== dbKu) diffs.push(`KU:${xKu}|${dbKu}`);
    if (xG !== expG) diffs.push(`G:${xG}|${expG}`);
    if (norm(x.birth) !== norm(dbBirth)) diffs.push(`BIRTH:${x.birth}|${dbBirth}`);
    if (diffs.length) { mismatch++; issues.push(`MISMATCH row${x.row} ${dbName} → ${diffs.join(", ")}`); }
    else matched++;
  }
  const extras = excelRows.filter(x => !used.has(x.row));
  // duplikat nama di Excel
  const seen = new Map(); const dups = [];
  for (const x of excelRows) { seen.set(x.name, (seen.get(x.name) ?? 0) + 1); if (seen.get(x.name) > 1 && !dups.includes(x.name)) dups.push(x.name); }

  console.log(`RESULT: MATCHED=${matched} MISMATCH=${mismatch} MISSING=${missing} EXTRA=${extras.length} DUPLICATE=${dups.length}`);
  if (extras.length) extras.forEach(x => issues.push(`EXTRA row${x.row}: ${x.name}`));
  if (dups.length) issues.push(`DUPLICATE names: ${dups.join(", ")}`);
  if (issues.length) issues.slice(0, 20).forEach(s => console.log("  -", s));
}
