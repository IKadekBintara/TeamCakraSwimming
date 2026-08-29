/**
 * FASE 3 helper — kredensial DB: set password role postgres via MCP execute_sql
 * (setara tombol "Reset database password" dashboard), tulis .env Laravel
 * memakai session pooler (IPv4). Password TIDAK PERNAH dicetak/log.
 * Aman dijalankan ulang: password baru di-generate tiap run, .env ikut ter-update.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const PROJECT = "akxfonpjqanvgkikttxz";
const ENDPOINT = "https://mcp.supabase.com/mcp";
const tok = JSON.parse(readFileSync(process.env.LOCALAPPDATA + "/hermes/mcp-tokens/supabase.json", "utf8"));

let idCounter = 0;
async function rpc(method, params, sessionId = null) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${tok.access_token}`,
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method, params }) });
  const sid = res.headers.get("mcp-session-id");
  const ct = res.headers.get("content-type") ?? "";
  let body = null;
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try { const j = JSON.parse(line.slice(5).trim()); if (j.id === idCounter) body = j; } catch {}
    }
  } else { try { body = await res.json(); } catch {} }
  return { status: res.status, sessionId: sid, body };
}
const die = (m) => { console.error("FAIL:", m); process.exit(1); };

const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laravel-db-setup", version: "1.0.0" } });
if (!init.body || init.body.error) die("initialize: " + JSON.stringify(init.body?.error ?? init.status));
const sid = init.sessionId;
await rpc("notifications/initialized", {}, sid);
const ping = await rpc("tools/call", { name: "list_projects", arguments: {} }, sid);
const txt = (ping.body?.result?.content ?? []).map((c) => c.text ?? "").join("");
if (!txt.includes(PROJECT)) die("project TCS tidak ditemukan — STOP");

// --- password acak (base64url: aman disisipkan tanpa escaping SQL) ---
const pw = randomBytes(24).toString("base64url");
// ALTER ROLE via Management API /database/query (berjalan sebagai superuser postgres).
const alt = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: `alter role postgres password '${pw}';` }),
});
if (!alt.ok) die(`alter role: HTTP ${alt.status} ${(await alt.text()).slice(0, 200)}`);
console.log("password role postgres diperbarui (nilai tidak dicetak).");

// --- tulis .env Laravel (session pooler IPv4: aws-0-<region>.pooler.supabase.com:5432) ---
const url = readFileSync("D:/Projects/TeamCakraSwimming/.env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const ref = url.replace("https://", "").split(".")[0];
const host = "aws-0-ap-southeast-1.pooler.supabase.com";
const envLaravel = "D:/Projects/TeamCakraLaravel/.env";
let env = readFileSync(envLaravel, "utf8");
const set = (k, v) => { env = env.includes(`\n${k}=`) ? env.replace(new RegExp(`\\n${k}=.*`), `\n${k}=${v}`) : env + `\n${k}=${v}\n`; };
set("DB_CONNECTION", "pgsql");
set("DB_HOST", host);
set("DB_PORT", "5432");
set("DB_DATABASE", "postgres");
set("DB_USERNAME", `postgres.${ref}`);
set("DB_PASSWORD", pw);
set("SUPABASE_URL", url);
writeFileSync(envLaravel, env);
console.log("Laravel .env ditulis (pooler session mode, user postgres.<ref>, password di file lokal).");
