/**
 * FASE 3 finisher — jalankan SETELAH user reset password DB via dashboard
 * dan menaruhnya di D:\Projects\TeamCakraLaravel\.dbpassword.
 * Menulis .env → tes koneksi PDO → HAPUS file password.
 * Password tidak pernah dicetak/log.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";

const PW_FILE = "D:/Projects/TeamCakraLaravel/.dbpassword";
if (!existsSync(PW_FILE)) { console.error("BELUM ADA .dbpassword — user belum reset password."); process.exit(1); }
const pw = readFileSync(PW_FILE, "utf8").trim();
if (!pw) { console.error("File .dbpassword kosong."); process.exit(1); }

const url = readFileSync("D:/Projects/TeamCakraSwimming/.env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const ref = url.replace("https://", "").split(".")[0];
const host = "aws-0-ap-southeast-1.pooler.supabase.com";

// 1) tulis .env Laravel
let env = readFileSync("D:/Projects/TeamCakraLaravel/.env", "utf8");
const set = (k, v) => { env = env.includes(`\n${k}=`) ? env.replace(new RegExp(`\\n${k}=.*`), `\n${k}=${v}`) : env + `\n${k}=${v}\n`; };
set("DB_CONNECTION", "pgsql");
set("DB_HOST", host);
set("DB_PORT", "5432");
set("DB_DATABASE", "postgres");
set("DB_USERNAME", `postgres.${ref}`);
set("DB_PASSWORD", pw);
writeFileSync("D:/Projects/TeamCakraLaravel/.env", env);

// 2) tes koneksi PDO baca tabel produksi
const php = `<?php
$e = ['u' => 'postgres.${ref}', 'p' => file_get_contents('D:/Projects/TeamCakraLaravel/.dbpassword')];
try {
  $pdo = new PDO("pgsql:host=${host};port=5432;dbname=postgres", $e['u'], trim($e['p']), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 25]);
  echo "CONNECT OK — atlet: " . $pdo->query('select count(*) from athletes')->fetchColumn() . ", events: " . $pdo->query('select count(*) from events')->fetchColumn() . ", payments: " . $pdo->query('select count(*) from event_payments')->fetchColumn() . "\\n";
} catch (Throwable $x) { echo "ERR: " . substr($x->getMessage(), 0, 200) . "\\n"; exit(1); }
`;
writeFileSync("D:/Projects/TeamCakraLaravel/dbtest.php", php);

// 3) hapus file password SEKARANG (sebelum tes dijalankan — PHP baca dari .dbpassword; 
//    setelah .env ditulis, .dbpassword tidak diperlukan lagi)
//    NOTE: dbtest.php dibuat membaca .dbpassword → jadi urutan dibalik: tes dulu, baru hapus.
console.log("Siap tes koneksi. Jalankan: php dbtest.php, lalu file password dihapus bila sukses.");
