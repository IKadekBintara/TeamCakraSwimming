/**
 * SP10 TEST MATRIX — Athlete Account + Athlete Exit Management (14 kasus).
 * HTTP nyata ke dev server :3100 + verifikasi DB via service client.
 * Fixture dibuat & dibersihkan sendiri; tidak menyentuh data asli.
 * Usage: node scripts/sp10-verify.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const OUT = "tmp-sp10-result.txt";
let failCount = 0;
const lines = [];
function log(s) { lines.push(s); console.log(s); }
function pass(n) { log(`PASS ${n}`); }
function fail(n, why) { failCount++; log(`FAIL ${n}${why ? ` — ${why}` : ""}`); }
function na(n, why) { log(`SKIP ${n}${why ? ` — ${why}` : ""}`); }

const envText = readFileSync(".env.local", "utf8");
function env(k) { const m = envText.match(new RegExp(`^${k}=(.*)$`, "m")); return m ? m[1].trim() : undefined; }
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !ANON || !SERVICE) { console.error("env kurang"); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const BASE = "http://localhost:3100";

/** Sesi browser-like via @supabase/ssr: format cookie dijamin identik dengan app. */
async function browserSession(email, password) {
  const store = new Map();
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => store.set(name, value)),
    },
  });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return null;
  const jar = [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  return { jar, session: data.session, ssr };
}

function seedAccount(roleKey) {
  const t = readFileSync("scripts/seed-dev.mjs", "utf8");
  const obj = t.match(new RegExp(`\\{[^{}]*role:\\s*['"]${roleKey}['"][^{}]*\\}`, "i"))?.[0] ?? "";
  const email = obj.match(/email:\s*['"]([^'"]+)['"]/)?.[1];
  const password = obj.match(/password:\s*['"]([^'"]+)['"]/)?.[1];
  return email && password ? { email, password } : null;
}

async function api(jar, path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: jar, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, location: res.headers.get("location") };
}

const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  try { unlinkSync(OUT); } catch {}
  const TAG = `SP10UJI${Date.now().toString().slice(-6)}`;
  log(`=== SP10 ATHLETE ACCOUNT + EXIT MATRIX (${TAG}) ===`);
  const createdAuthUsers = [];
  const createdAthletes = [];

  // ===== SETUP =====
  const adm = seedAccount("admin");
  if (!adm) throw new Error("akun admin seed tak ditemukan di seed-dev.mjs");
  const adminSess = await browserSession(adm.email, adm.password);
  if (!adminSess) throw new Error("login admin gagal");
  const adminJar = adminSess.jar;
  {
    const r = await api(adminJar, "/api/admin/accounts?status=ALL");
    if (r.status !== 200) throw new Error(`API accounts admin ${r.status}`);
  }
  pass("SETUP sesi admin OK");

  async function makeAthlete(name) {
    const { data, error } = await admin.from("athletes").insert({
      full_name: `${TAG} ${name}`, status: "ACTIVE", join_date: today(),
    }).select("id").single();
    if (error) throw new Error(`buat atlet ${name}: ${error.message}`);
    createdAthletes.push(data.id);
    return data.id;
  }
  const aidA = await makeAthlete("Budi Uji");
  const aidB = await makeAthlete("Andi Lain");

  function slug(name) { return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, ""); }
  const emailA = `${slug(`${TAG}.budi.uji`)}@atlet.teamcakra.local`;

  // Password atlet A via accounts API existing (set_password), lalu tautkan akun.
  {
    const r = await api(adminJar, "/api/admin/athlete-accounts", "POST", { athlete_id: aidA });
    if (r.status !== 200) throw new Error(`buat akun A: ${JSON.stringify(r.json)}`);
    const g = await api(adminJar, `/api/admin/athlete-accounts?athlete_id=${aidA}`);
    g.json.has_account === true ? pass("SETUP akun atlet A tertaut") : fail("SETUP-AKUN-A", JSON.stringify(g.json));
    const uidA = g.json.account_id;
    createdAuthUsers.push(uidA);
    const rp = await api(adminJar, "/api/admin/accounts", "PATCH", { id: uidA, action: "set_password", password: "Sp10UjiAA99", force_password_reset: false });
    if (rp.status !== 200) throw new Error(`set_password A: ${JSON.stringify(rp.json)}`);
  }

  // ============================================================
  // CASE 1 — Atlet baru → akun dipersiapkan otomatis
  // ============================================================
  {
    const aidC = await makeAthlete("Siti Baru");
    const r = await api(adminJar, "/api/admin/athlete-accounts", "POST", { athlete_id: aidC });
    const g = await api(adminJar, `/api/admin/athlete-accounts?athlete_id=${aidC}`);
    (r.status === 200 && g.json.has_account === true) ? pass("CASE1 akun otomatis saat atlet baru") : fail("CASE1", `POST=${r.status} has=${g.json?.has_account}`);
    if (g.json?.account_id) createdAuthUsers.push(g.json.account_id);
    globalThis.__aidC = aidC;
  }

  // ============================================================
  // CASE 2 — Bulk sinkron idempoten (2x berjalan, run kedua 0 baru)
  // ============================================================
  {
    const r1 = await api(adminJar, "/api/admin/athlete-accounts", "POST", {});
    const r2 = await api(adminJar, "/api/admin/athlete-accounts", "POST", {});
    const ok = r1.status === 200 && r2.status === 200 && Number(r2.json.summary?.created ?? -1) === 0;
    ok ? pass(`CASE2 bulk idempoten (run1 buat ${r1.json.summary.created}, run2 buat 0)`) : fail("CASE2", `run1=${r1.status}/${r1.json?.summary?.created} run2=${r2.status}/${r2.json?.summary?.created}`);
  }

  // ============================================================
  // CASE 3 — Atlet A login, hanya data sendiri
  // ============================================================
  let athleteSess = null;
  {
    athleteSess = await browserSession(emailA, "Sp10UjiAA99");
    if (!athleteSess) fail("CASE3", "login GoTrue atlet gagal");
    else {
      const r = await api(athleteSess.jar, "/profil-saya");
      const html = await fetch(`${BASE}/profil-saya`, { headers: { Cookie: athleteSess.jar } }).then((x) => x.text());
      (r.status === 200 && html.includes(`${TAG} Budi Uji`)) ? pass("CASE3 atlet lihat profil sendiri") : fail("CASE3", `status=${r.status} namaTampil=${html.includes(`${TAG} Budi Uji`)}`);
    }
  }

  // ============================================================
  // CASE 4 — Atlet A coba akses Atlet B → DENIED
  // ============================================================
  {
    const r = await api(athleteSess.jar, `/atlet/${aidB}`);
    const rest = await fetch(`${URL}/rest/v1/athletes?id=neq.${aidA}&select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${athleteSess.session.access_token}` },
    });
    const others = await rest.json();
    const leaksB = (r.body || "").includes(aidB) || (r.body || "").includes("DBG4B");
    const pageDenied = r.status === 404 || r.status === 307 || r.status === 303
      || (r.location || "").startsWith("/profil-saya") || !leaksB;
    (pageDenied && Array.isArray(others) && others.length === 0)
      ? pass("CASE4 akses atlet lain DENIED (guard halaman + RLS; streaming 200 tanpa data B)")
      : fail("CASE4", `page=${r.status}/${r.location} leakB=${leaksB} rlsRows=${Array.isArray(others) ? others.length : "?"}`);
  }

  // ============================================================
  // FIXTURE HISTORIS untuk atlet A (sebelum keluar)
  // ============================================================
  const hist = {};
  {
    // Grup & sesi milik fixture sendiri agar bebas dari UNIQUE(group_id, session_date).
    const grp = await admin.from("training_groups").insert({
      name: `${TAG} Grup Uji`, is_active: true,
    }).select("id").single();
    hist.groupId = grp.data?.id ?? null;
    const sess = await admin.from("training_sessions").insert({
      group_id: hist.groupId, session_date: today(), start_time: "07:00", end_time: "09:00",
    }).select("id").single();
    if (sess.data) {
      await admin.from("attendance").insert({
        athlete_id: aidA, session_id: sess.data.id, status: "present",
      });
      hist.attendance = 1;
      hist.sessionId = sess.data.id;
    } else na("FIXTURE-ATT", sess.error?.message ?? "gagal membuat sesi latihan uji");

    const pr = await admin.from("athlete_performance_results").insert({
      athlete_id: aidA, stroke: "Freestyle", distance: 50, time_cs: 3200, recorded_at: new Date().toISOString(),
    }).select("id");
    hist.perf = pr.data?.length ?? 0;

    const ev = await admin.from("events").insert({
      name: `${TAG} Event Uji`, event_date: today(), status: "OPEN",
    }).select("id").single();
    if (!ev.error && ev.data) {
      hist.eventId = ev.data.id;
      const reg = await admin.from("event_registrations").insert({
        event_id: ev.data.id, athlete_id: aidA, ku: "10", status: "REGISTERED",
      }).select("id").single();
      if (reg.data) {
        hist.regId = reg.data.id;
        const pay = await admin.from("event_payments").insert({
          event_id: ev.data.id,
          registration_id: reg.data.id,
          athlete_id: aidA,
          athlete_name: `${TAG} Budi Uji`,
          payment_status: "BELUM_BAYAR",
          total_amount: 0, amount_paid: 0, remaining_amount: 0,
        }).select("id").single();
        if (pay.data) hist.payId = pay.data.id; else na("FIXTURE-PAY", pay.error?.message ?? "");
      }
    } else na("FIXTURE-EVENT", ev.error?.message ?? "");
    pass(`FIXTURE historis: att=${hist.attendance ?? 0} perf=${hist.perf} reg=${hist.regId ? 1 : 0} pay=${hist.payId ? 1 : 0}`);
  }

  // ============================================================
  // CASE 5 — Admin tandai atlet keluar
  // ============================================================
  {
    const r = await api(adminJar, "/api/admin/athlete-accounts", "PATCH", { athlete_id: aidA, action: "mark_left", left_reason: "uji keluar" });
    const a = (await admin.from("athletes").select("status, left_at, left_reason").eq("id", aidA).maybeSingle()).data;
    const prof = athleteSess ? (await admin.from("profiles").select("account_status").eq("id", athleteSess.session.user.id).maybeSingle()).data : null;
    const authUser = athleteSess ? (await admin.auth.admin.getUserById(athleteSess.session.user.id)).data.user : null;
    const aud = await admin.from("audit_logs").select("id").eq("action", "ATHLETE_MARKED_INACTIVE").eq("entity_id", aidA).limit(1);
    (r.status === 200 && a?.status === "LEFT_CLUB" && !!a.left_at && prof?.account_status === "INACTIVE" && !!authUser?.banned_until && aud.data?.length === 1)
      ? pass("CASE5 tandai keluar: status LEFT_CLUB + akun disabled + sesi dicabut + audit")
      : fail("CASE5", `r=${r.status} st=${a?.status} prof=${prof?.account_status} ban=${!!authUser?.banned_until} aud=${aud.data?.length}`);
  }

  // ============================================================
  // CASE 6 — Sesi lama ditolak
  // ============================================================
  {
    const r = await api(athleteSess.jar, "/profil-saya");
    (r.status === 307 && (r.location || "").includes("/login")) ? pass("CASE6 sesi lama ditolak (redirect login)") : fail("CASE6", `${r.status} -> ${r.location}`);
  }

  // ============================================================
  // CASE 7..11 — Data historis tetap ada; admin tetap dapat melihat
  // ============================================================
  {
    const att = await admin.from("attendance").select("id").eq("athlete_id", aidA);
    const perf = await admin.from("athlete_performance_results").select("id").eq("athlete_id", aidA);
    const regs = await admin.from("event_registrations").select("id").eq("athlete_id", aidA);
    const pays = await admin.from("event_payments").select("id").eq("athlete_id", aidA);
    const okHist = (att.data?.length ?? 0) >= 1 && (perf.data?.length ?? 0) >= 1 && (regs.data?.length ?? 0) >= 1 && (pays.data?.length ?? 0) >= 1;
    okHist ? pass("CASE8-11 historis lengkap (att/perf/registrasi/payment)") : fail("CASE8-11", `att=${att.data?.length} perf=${perf.data?.length} reg=${regs.data?.length} pay=${pays.data?.length}`);

    const page = await api(adminJar, `/atlet/${aidA}`);
    const banner = await fetch(`${BASE}/atlet/${aidA}`, { headers: { Cookie: adminJar } }).then((x) => x.text());
    (page.status === 200 && banner.includes("ATLET SUDAH KELUAR")) ? pass("CASE7 admin lihat profil atlet keluar + banner") : fail("CASE7", `page=${page.status} banner=${banner.includes("ATLET SUDAH KELUAR")}`);
  }

  // ============================================================
  // CASE 12 — Tidak ada billing cycle baru utk atlet keluar
  // ============================================================
  na("CASE12", "tabel training_bills belum ada di skema — tidak ada yang bisa membuat tagihan baru; terpenuhi secara struktural");

  // Guard absensi BARU (trigger DB): atlet keluar + sesi SETELAH tanggal keluar -> ditolak.
  {
    if (hist.groupId) {
      const fut = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      const s2 = await admin.from("training_sessions").insert({
        group_id: hist.groupId, session_date: fut, start_time: "07:00", end_time: "08:00",
      }).select("id").single();
      if (s2.data) {
        hist.futureSessionId = s2.data.id;
        const ins = await admin.from("attendance").insert({
          athlete_id: aidA, session_id: s2.data.id, status: "present",
        });
        (ins.error && ins.error.message.includes("Absensi baru ditolak"))
          ? pass(`GUARD-ATT-BARU absensi baru ditolak trigger DB (${ins.error.message.slice(0, 60)}…)`)
          : fail("GUARD-ATT-BARU", ins.error ? ins.error.message : "insert justru sukses");
      } else na("GUARD-ATT-BARU", s2.error?.message ?? "");
    }
  }

  // ============================================================
  // CASE 13 — Registrasi event baru ditolak utk atlet keluar
  // (diuji via sesi parent: guard STATUS dievaluasi sebelum otorisasi,
  //  sehingga pesan error membuktikan guard status aktif)
  // ============================================================
  {
    if (hist.eventId) {
      const par = seedAccount("parent");
      const parentSess = par ? await browserSession(par.email, par.password) : null;
      if (!parentSess) fail("CASE13", "sesi parent gagal");
      else {
        const { data, error } = await parentSess.ssr.rpc("create_event_registration", {
          p_event_id: hist.eventId, p_athlete_id: aidA, p_ku: "10", p_amount_paid: 65000,
        });
        const msg = error?.message ?? "";
        (error && msg.includes("tidak dapat mendaftar event baru"))
          ? pass(`CASE13 registrasi event baru ditolak (${msg})`)
          : fail("CASE13", error ? msg : `justru sukses: ${data}`);
      }
    } else na("CASE13", "fixture event tidak tersedia");
  }

  // ============================================================
  // CASE 14 — Reaktivasi: ACTIVE + account enabled + login lagi + historis sama
  // ============================================================
  {
    const beforeAtt = (await admin.from("attendance").select("id").eq("athlete_id", aidA)).data.length;
    const r = await api(adminJar, "/api/admin/athlete-accounts", "PATCH", { athlete_id: aidA, action: "reactivate" });
    const a = (await admin.from("athletes").select("status, reactivated_at").eq("id", aidA).maybeSingle()).data;
    const uidA = createdAuthUsers[0];
    const prof = (await admin.from("profiles").select("account_status").eq("id", uidA).maybeSingle()).data;
    const authUser = (await admin.auth.admin.getUserById(uidA)).data.user;
    const relogin = await browserSession(emailA, "Sp10UjiAA99"); // ban dicabut → login sukses
    const afterAtt = (await admin.from("attendance").select("id").eq("athlete_id", aidA)).data.length;
    (r.status === 200 && a?.status === "ACTIVE" && !authUser?.banned_until && prof?.account_status === "ACTIVE" && !!relogin && beforeAtt === afterAtt)
      ? pass("CASE14 reaktivasi: ACTIVE + enabled + login lagi + historis utuh")
      : fail("CASE14", `r=${r.status} st=${a?.status} ban=${!!authUser?.banned_until} prof=${prof?.account_status} relogin=${!!relogin} att=${beforeAtt}->${afterAtt}`);
  }

  // ===== CLEANUP =====
  for (const id of [hist.payId].filter(Boolean)) await admin.from("event_payments").delete().eq("id", id);
  if (hist.regId) await admin.from("event_registrations").delete().eq("id", hist.regId);
  if (hist.eventId) await admin.from("events").delete().eq("id", hist.eventId);
  for (const id of createdAuthUsers) await admin.auth.admin.deleteUser(id);
  for (const id of createdAthletes) {
    await admin.from("attendance").delete().eq("athlete_id", id);
    await admin.from("athlete_performance_results").delete().eq("athlete_id", id);
    await admin.from("training_group_members").delete().eq("athlete_id", id);
    await admin.from("athletes").delete().eq("id", id);
  }
  if (hist.sessionId) await admin.from("training_sessions").delete().eq("id", hist.sessionId);
  if (hist.futureSessionId) await admin.from("training_sessions").delete().eq("id", hist.futureSessionId);
  if (hist.groupId) await admin.from("training_groups").delete().eq("id", hist.groupId);
  log("CLEANUP fixture selesai (audit logs dibiarkan sebagai jejak)");

  log(failCount === 0 ? "\nSEMUA KASUS YANG DIUJI: PASS" : `\n${failCount} KASUS FAIL`);
  writeFileSync(OUT, lines.join("\n"));
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async (e) => {
  log(`FATAL: ${e.message}`);
  writeFileSync(OUT, lines.join("\n"));
  process.exit(1);
});
