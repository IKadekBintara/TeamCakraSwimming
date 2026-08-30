/** FINAL SWEEP: setup/cleanup data uji + QA admin utk verifikasi semua fitur Laravel. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = readFileSync("D:/Projects/TeamCakraSwimming/.env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const service = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1].trim();
const H = () => ({ apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" });
const rest = async (table, method, body, query = "") => {
  const r = await fetch(`${url}/rest/v1/${table}${query}`, { method, headers: { ...H(), Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${table} ${method}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
};
const mode = process.argv[2] ?? "setup";
const stateFile = "D:/Projects/TeamCakraLaravel/qa-final-state.json";

if (mode === "setup") {
  const email = `qa-fin-${randomBytes(3).toString("hex")}@teamcakra.test`;
  const pw = `Qa!${randomBytes(9).toString("base64url")}`;
  const u = await (await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: H(), body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: "QA FINAL SWEEP" } }) })).json();
  await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify({ role: "admin" }) });

  const [ev] = await rest("events", "POST", { name: "ZZTEST-EVENT-FINAL", event_date: "2026-12-31", fee_per_entry: 55000, admin_fee: 20000, status: "OPEN" });
  const [race] = await rest("event_races", "POST", { event_id: ev.id, name: "100m Gaya Bebas TEST", is_active: true, distance_m: 100, stroke: "Gaya Bebas", price: 55000, allowed_kus: [] });
  const [ath] = await rest("athletes", "POST", { full_name: "ZZTEST ATLET FINAL SWEEP", birth_date: "2013-05-05", gender: "F", status: "ACTIVE", join_date: "2026-01-01" });

  writeFileSync(stateFile, JSON.stringify({ userId: u.id, eventId: ev.id, raceId: race.id, athleteId: ath.id }));
  writeFileSync("D:/Projects/TeamCakraLaravel/qa-creds.php", `<?php
$a_email = '${email}'; $a_pw = '${pw}';
$ev = '${ev.id}'; $race = '${race.id}'; $ath = '${ath.id}';
$db_user = 'postgres.akxfonpjqanvgkikttxz';
$db_pw = trim((function (): string { foreach (file('D:/Projects/TeamCakraLaravel/.env', FILE_IGNORE_NEW_LINES) as $l) { if (preg_match('/^DB_PASSWORD=(.*)$/', $l, $m)) return $m[1]; } return ''; })());
`);
  console.log("setup FINAL OK");
  process.exit(0);
}

if (mode === "cleanup") {
  const s = JSON.parse(readFileSync(stateFile, "utf8"));
  const regs = await rest("event_registrations", "GET", null, `?athlete_id=eq.${s.athleteId}&select=id`);
  const regIds = regs.map((r) => r.id);
  const pays = regIds.length ? await rest("event_payments", "GET", null, `?registration_id=in.(${regIds.join(",")})&select=id`) : [];
  for (const p of pays) await rest("audit_logs", "DELETE", null, `?entity_id=eq.${p.id}&entity=eq.event_payments`);
  if (regIds.length) await rest("excel_sync_jobs", "DELETE", null, `?registration_id=in.(${regIds.join(",")})`);
  for (const r of regs) {
    await rest("event_registration_entries", "DELETE", null, `?registration_id=eq.${r.id}`);
    await rest("event_payments", "DELETE", null, `?registration_id=eq.${r.id}`);
    await rest("event_registrations", "DELETE", null, `?id=eq.${r.id}`);
  }
  await rest("audit_logs", "DELETE", null, `?actor_id=eq.${s.userId}`);
  await rest("event_races", "DELETE", null, `?id=eq.${s.raceId}`);
  await rest("events", "DELETE", null, `?id=eq.${s.eventId}`);
  await rest("athletes", "DELETE", null, `?id=eq.${s.athleteId}`);
  const del = await fetch(`${url}/auth/v1/admin/users/${s.userId}`, { method: "DELETE", headers: H() });
  for (const f of ["qa-creds.php", "qa-final.php", "qa-cookies.txt", stateFile]) { const p = `D:/Projects/TeamCakraLaravel/${f}`; if (existsSync(p)) unlinkSync(p); }
  console.log("cleanup FINAL: HTTP", del.status);
  process.exit(0);
}
