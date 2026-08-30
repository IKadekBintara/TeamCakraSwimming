/** TEST 1 (FASE 22): daftar → cancel → remove → daftar-lagi via Laravel. Setup/verify/cleanup di sini; alur HTTP di qa-test1.php. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = readFileSync("D:/Projects/TeamCakraSwimming/.env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const service = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1].trim();
const H = () => ({ apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" });
const rest = async (table, method, body, query = "") => {
  const r = await fetch(`${url}/rest/v1/${table}${query}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${table} ${method}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
};
const mode = process.argv[2] ?? "setup";
const stateFile = "D:/Projects/TeamCakraLaravel/qa-test1-state.json";

if (mode === "setup") {
  // QA admin
  const email = `qa-t1-${randomBytes(3).toString("hex")}@teamcakra.test`;
  const pw = `Qa!${randomBytes(9).toString("base64url")}`;
  const u = await (await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: H(), body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: "QA TEST1 ADMIN" } }) })).json();
  await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify({ role: "admin" }) });

  // Data uji: event OPEN + 1 race + 1 atlet (nama unik ZZTEST)
  const [ev] = await rest("events", "POST", { name: "ZZTEST-EVENT-LARAVEL-1", event_date: "2026-12-31", fee_per_entry: 55000, admin_fee: 20000, status: "OPEN" });
  const [race] = await rest("event_races", "POST", { event_id: ev.id, name: "50m Gaya Bebas TEST", is_active: true, distance_m: 50, stroke: "Gaya Bebas", price: 55000, allowed_kus: [] });
  const [ath] = await rest("athletes", "POST", { full_name: "ZZTEST ATLET LARAVEL TEST1", birth_date: "2015-01-01", gender: "M", status: "ACTIVE", join_date: "2026-01-01" });

  writeFileSync(stateFile, JSON.stringify({ userId: u.id, eventId: ev.id, raceId: race.id, athleteId: ath.id }));
  writeFileSync("D:/Projects/TeamCakraLaravel/qa-creds.php", `<?php $a_email = '${email}'; $a_pw = '${pw}'; $ev = '${ev.id}'; $race = '${race.id}'; $ath = '${ath.id}';`);
  console.log("setup OK (event/race/atlet/QA-admin)");
  process.exit(0);
}

if (mode === "cleanup") {
  const s = JSON.parse(readFileSync(stateFile, "utf8"));
  // registrations mungkin sudah terhapus oleh REMOVE; bersisa dibersihkan by UUID
  const regs = await rest("event_registrations", "GET", null, `?athlete_id=eq.${s.athleteId}&select=id`);
  const regIds = regs.map((r) => r.id);
  if (regIds.length) {
    await rest("excel_sync_jobs", "DELETE", null, `?registration_id=in.(${regIds.join(",")})`);
  }
  for (const r of regs) {
    await rest("event_registration_entries", "DELETE", null, `?registration_id=eq.${r.id}`);
    await rest("event_payments", "DELETE", null, `?registration_id=eq.${r.id}`);
    await rest("event_registrations", "DELETE", null, `?id=eq.${r.id}`);
  }
  await rest("event_races", "DELETE", null, `?id=eq.${s.raceId}`);
  await rest("events", "DELETE", null, `?id=eq.${s.eventId}`);
  await rest("athletes", "DELETE", null, `?id=eq.${s.athleteId}`);
  const del = await fetch(`${url}/auth/v1/admin/users/${s.userId}`, { method: "DELETE", headers: H() });
  for (const f of ["qa-creds.php", "qa-test1.php", "qa-cookies.txt", stateFile]) { const p = `D:/Projects/TeamCakraLaravel/${f}`; if (existsSync(p)) unlinkSync(p); }
  console.log("cleanup TEST1: HTTP", del.status);
  process.exit(0);
}
