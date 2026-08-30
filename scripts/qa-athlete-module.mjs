/** QA modul atlet: buat user parent + admin, test akses, cleanup. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = readFileSync("D:/Projects/TeamCakraSwimming/.env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const service = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1].trim();
const H = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" });

const SUFFIX = randomBytes(3).toString("hex");
const mkUser = async (email, role, name) => {
  const pw = `Qa!${randomBytes(9).toString("base64url")}`;
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: H(service),
    body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }),
  });
  if (!r.ok) throw new Error(`create ${email}: ${r.status}`);
  const u = await r.json();
  // Role sesuai kebutuhan test (override default 'parent' bila perlu)
  if (role !== "parent") {
    const upd = await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, {
      method: "PATCH", headers: { ...H(service), Prefer: "return=minimal" },
      body: JSON.stringify({ role }),
    });
    if (!upd.ok) throw new Error(`update role: ${upd.status}`);
  }
  return { id: u.id, email, pw, role };
};

const mode = process.argv[2] ?? "create";
const stateFile = "D:/Projects/TeamCakraLaravel/qa-ath-state.json";

if (mode === "create") {
  const parent = await mkUser(`qa-par-${SUFFIX}@teamcakra.test`, "parent", "QA PARENT");
  const admin = await mkUser(`qa-adm-${SUFFIX}@teamcakra.test`, "admin", "QA ADMIN");
  writeFileSync(stateFile, JSON.stringify([parent, admin]));
  // kredensial utk test PHP
  writeFileSync("D:/Projects/TeamCakraLaravel/qa-creds.php", `<?php
$p_email = '${parent.email}'; $p_pw = '${parent.pw}';
$a_email = '${admin.email}'; $a_pw = '${admin.pw}';
`);
  console.log("2 user QA dibuat (parent + admin) — kredensial di file lokal, tidak dicetak.");
  process.exit(0);
}

if (mode === "cleanup") {
  const users = JSON.parse(readFileSync(stateFile, "utf8"));
  for (const u of users) {
    const del = await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H(service) });
    console.log(`cleanup ${u.role}: HTTP ${del.status}`);
  }
  for (const f of ["qa-creds.php", "qa-ath-test.php", "qa-cookies.txt", stateFile]) {
    const p = f.startsWith("D:") ? f : `D:/Projects/TeamCakraLaravel/${f}`;
    if (existsSync(p)) unlinkSync(p);
  }
  console.log("file QA dihapus");
  process.exit(0);
}
