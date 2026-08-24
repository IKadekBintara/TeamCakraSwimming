/**
 * SP13 — NAVIGATION PARITY CHECK
 * Membandingkan: (1) shared config components/navigation.ts,
 * (2) daftar menu LEGACY dari Sidebar lama (hardcode di bawah),
 * (3) route nyata di app/(app)/**\/page.tsx.
 * FAIL jika: ada menu legacy yang hilang/berubah role, atau href tanpa route.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

// ---------- 1. Parse config baru ----------
const navSrc = readFileSync(join(root, "components", "navigation.ts"), "utf8");
const roleConsts = {};
for (const m of navSrc.matchAll(/const (\w+): Role\[\] = \[([^\]]+)\];/g)) {
  roleConsts[m[1]] = m[2].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
}
function resolveRoles(token) {
  const t = token.trim();
  if (t.startsWith("[")) return t.slice(1, -1).split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
  return roleConsts[t] ?? null;
}
const NEW = [];
for (const m of navSrc.matchAll(/\{\s*href:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*icon:[^,]+,\s*roles:\s*([^}]+?)\s*\}/g)) {
  NEW.push({ href: m[1], label: m[2], roles: resolveRoles(m[3]) });
}

// ---------- 2. Legacy (Sidebar sebelum refactor) ----------
const R = {
  ALL: ["admin", "operator", "coach", "group_leader", "ketua_kelompok", "athlete", "parent"],
  STAFF: ["admin", "operator", "coach", "group_leader", "ketua_kelompok"],
  ADMIN: ["admin"],
  ATLET: ["athlete", "parent"],
};
const LEGACY = [
  ["/dashboard", "Dashboard", R.ALL],
  ["/profil-saya", "Profil Saya", R.ATLET],
  ["/absensi-saya", "Absensi Saya", R.ATLET],
  ["/performance-saya", "Performance Saya", R.ATLET],
  ["/pembayaran-saya", "Pembayaran Saya", R.ATLET],
  ["/atlet", "Atlet", R.STAFF],
  ["/kelompok", "Kelompok Latihan", R.STAFF],
  ["/jadwal", "Jadwal", R.ALL],
  ["/absensi", "Absensi", R.STAFF],
  ["/events", "Events", R.ALL],
  ["/registrations", "Pendaftaran", R.STAFF],
  ["/event-settings", "Event Settings", R.ADMIN],
  ["/performance", "Performance", R.STAFF],
  ["/keuangan", "Keuangan", R.ADMIN],
  ["/laporan", "Laporan Kehadiran", R.STAFF],
  ["/reports", "Report Center", R.ADMIN],
  ["/import-export", "Import / Export", ["admin", "operator"]],
  ["/communication", "Komunikasi", ["admin", "operator"]],
  ["/notifications", "Notifikasi", R.ALL],
  ["/users", "Users", R.ADMIN],
  ["/accounts", "Account Management", R.ADMIN],
  ["/excel-sync", "Sinkronisasi Excel", R.ADMIN],
  ["/settings", "Settings", R.ADMIN],
  ["/audit", "Audit Logs", R.ADMIN],
].map(([href, label, roles]) => ({ href, label, roles }));

// ---------- 3. Route nyata ----------
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (e === "page.tsx") acc.push(p);
  }
  return acc;
}
const routeFiles = walk(join(root, "app", "(app)"));
const routes = routeFiles.map((f) => "/" + f.split(/[\\/]/).slice(join(root, "app", "(app)").split(/[\\/]/).length).join("/").replace(/[\\/]page\.tsx$/, "").replace(/\\\((.+?)\\\)/g, "").toLowerCase()).map((r) => r.replace(/^\/+/, "/"));

// ---------- Checks ----------
const fails = [];
if (NEW.length !== LEGACY.length) fails.push(`Jumlah beda: baru=${NEW.length} legacy=${LEGACY.length}`);
for (const leg of LEGACY) {
  const n = NEW.find((x) => x.href === leg.href);
  if (!n) { fails.push(`HILANG dari config: ${leg.href}`); continue; }
  if (n.label !== leg.label) fails.push(`Label beda ${leg.href}: "${n.label}" vs "${leg.label}"`);
  const rs = JSON.stringify([...n.roles].sort()); const ls = JSON.stringify([...leg.roles].sort());
  if (rs !== ls) fails.push(`Roles beda ${leg.href}: [${n.roles}] vs [${leg.roles}]`);
}
for (const n of NEW) {
  const norm = n.href.toLowerCase().replace(/^\//, "").replace(/\//g, "\\");
  const own = routeFiles.some((f) => f.toLowerCase().endsWith(norm + "\\page.tsx"));
  const nested = routeFiles.some((f) => f.toLowerCase().includes("\\" + norm + "\\"));
  if (!own && !nested) fails.push(`TANPA ROUTE: ${n.href}`);
}
// Duplikat href dalam config
const seen = new Set();
for (const n of NEW) {
  if (seen.has(n.href)) fails.push(`DUPLIKAT di config: ${n.href}`);
  seen.add(n.href);
}

console.log(`Config baru : ${NEW.length} menu`);
console.log(`Legacy      : ${LEGACY.length} menu`);
console.log(`Route (app) : ${routes.length} halaman`);
console.log(fails.length ? `\n=== GAGAL (${fails.length}) ===\n` + fails.join("\n") : "\n=== PARITY OK: semua menu legacy tercakup, roles identik, semua href punya route ===");
process.exit(fails.length ? 1 : 0);
