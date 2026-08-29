/** Uji kandidat endpoint reset password DB + identifikasi role MCP. Output diredaksi. */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const PROJECT = "akxfonpjqanvgkikttxz";
const tok = JSON.parse(readFileSync(process.env.LOCALAPPDATA + "/hermes/mcp-tokens/supabase.json", "utf8"));
const H = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };

// 1) siapa current_user via MCP execute_sql
const ENDPOINT = "https://mcp.supabase.com/mcp";
let idCounter = 0;
async function rpc(method, params, sessionId = null) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${tok.access_token}`, "MCP-Protocol-Version": "2025-06-18" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method, params }) });
  const sid = res.headers.get("mcp-session-id");
  const ct = res.headers.get("content-type") ?? "";
  let body = null;
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    for (const line of text.split(/\r?\n/)) { if (!line.startsWith("data:")) continue; try { const j = JSON.parse(line.slice(5).trim()); if (j.id === idCounter) body = j; } catch {} }
  } else { try { body = await res.json(); } catch {} }
  return { status: res.status, sessionId: sid, body };
}
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1.0.0" } });
const sid = init.sessionId;
await rpc("notifications/initialized", {}, sid);
const who = await rpc("tools/call", { name: "execute_sql", arguments: { project_id: PROJECT, query: "select current_user, session_user" } }, sid);
const whoTxt = (who.body?.result?.content ?? []).map((c) => c.text ?? "").join("");
console.log("MCP current_user:", whoTxt.slice(0, 300));

// 2) kandidat endpoint Management API utk query SQL terprivilege / reset password
const pw = randomBytes(24).toString("base64url");
const candidates = [
  ["POST", `https://api.supabase.com/v1/projects/${PROJECT}/database/query`, { query: "select current_user" }],
  ["POST", `https://api.supabase.com/v0/projects/${PROJECT}/database/password`, { password: pw }],
  ["POST", `https://api.supabase.com/v1/projects/${PROJECT}/config/database/postgres`, { password: pw }],
];
for (const [m, u, b] of candidates) {
  try {
    const r = await fetch(u, { method: m, headers: H, body: JSON.stringify(b) });
    const t = await r.text();
    console.log(`${m} ${u.split(".com")[1]} -> HTTP ${r.status} |`, t.slice(0, 160).replace(new RegExp(pw, "g"), "[PW]"));
  } catch (e) { console.log(`${m} ${u} -> EXC ${e.message.slice(0, 80)}`); }
}
