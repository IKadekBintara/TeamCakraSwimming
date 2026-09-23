import fs from "fs";
const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
console.log("url_set:", !!U, "| service_role_set:", !!K);
const h = { apikey: K, Authorization: "Bearer " + K };
const r = await fetch(U + "/rest/v1/excel_sync_configurations?select=id,name,enabled,file_path,worksheet_name,header_row,first_data_row,max_row,ku_format,event_id", { headers: h });
console.log("http:", r.status);
const d = await r.json();
for (const c of d) {
  console.log(`  - ${c.name} | enabled=${c.enabled} | ku_format=${c.ku_format} | sheet="${c.worksheet_name}"`);
  console.log(`      path: ${c.file_path}`);
  const p = c.file_path.replace(/\//g, "\\");
  const exists = fs.existsSync(p);
  console.log(`      exists: ${exists}`);
  if (exists) {
    const st = fs.statSync(p);
    console.log(`      size: ${st.size} | mtime: ${st.mtime.toISOString()}`);
    try { fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK); console.log("      R/W: OK"); }
    catch (e) { console.log("      R/W: DENIED", e.code); }
  }
}
