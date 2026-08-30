/** QA: buat akun uji GoTrue (email_confirm: true), uji login Laravel, lalu HAPUS total. Tanpa mencetak secret. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = readFileSync("D:/Projects/TeamCakraSwimming/.env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const service = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1].trim();
const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)[1].trim();
const H = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" });

const EMAIL = `qa-laravel-${randomBytes(3).toString("hex")}@teamcakra.test`;
const PW = `Qa!${randomBytes(9).toString("base64url")}`;

const mode = process.argv[2] ?? "create";

if (mode === "create") {
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: H(service),
    body: JSON.stringify({ email: EMAIL, password: PW, email_confirm: true, user_metadata: { full_name: "QA LARAVEL BRIDGE" } }),
  });
  if (!r.ok) { console.error("buat user gagal:", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const u = await r.json();
  console.log("QA_USER_ID=" + u.id);
  // kredensial untuk test PHP (file lokal sementara)
  writeFileSync("D:/Projects/TeamCakraLaravel/qa-creds.php", `<?php $e = '${EMAIL}'; $p = '${PW}'; $uid = '${u.id}';`);
  console.log("qa-creds.php ditulis (tidak dicetak). Lanjut: php qa-test.php, lalu `node qa-auth-bridge.mjs cleanup`");
  process.exit(0);
}

if (mode === "cleanup") {
  const uid = process.argv[3];
  if (!uid) { console.error("cleanup butuh user id"); process.exit(1); }
  const del = await fetch(`${url}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: H(service) });
  console.log("cleanup user QA: HTTP", del.status);
  for (const f of ["qa-creds.php", "qa-test.php", "qa-cookies.txt"]) {
    const p = `D:/Projects/TeamCakraLaravel/${f}`;
    if (existsSync(p)) unlinkSync(p);
  }
  console.log("file QA dihapus");
  process.exit(0);
}
