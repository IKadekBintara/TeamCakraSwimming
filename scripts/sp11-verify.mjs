/**
 * SP11 TEST MATRIX — Event Registration Management.
 * HTTP nyata ke dev server :3100 + verifikasi DB service-role.
 * Fixture dibuat & dibersihkan sendiri; data nyata tidak disentuh.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
function env(k) {
  const m = envText.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}
const URL = env("NEXT_PUBLIC_SUPABASE_URL") || "";
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || "";
const SRK = env("SUPABASE_SERVICE_ROLE_KEY") || "";
const BASE = "http://localhost:3100";
const TAG = `SP11UJI${Date.now().toString().slice(-6)}`;

const admin = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });

/** insert dengan error jelas */
async function ins(table, payload) {
  const { data, error } = await admin.from(table).insert(payload).select("id").single();
  if (error || !data) throw new Error(`INSERT ${table} gagal: ${error?.message ?? "null"}`);
  return data.id;
}

let nPass = 0, nFail = 0;
const fails = [];
const pass = (l) => { nPass++; console.log(`  PASS ${l}`); };
const fail = (l, w) => { nFail++; fails.push(`${l}: ${w}`); console.log(`  FAIL ${l} — ${w}`); };
const ok = (c, l, w = "") => (c ? pass(l) : fail(l, w));

/** Sesi browser-like via @supabase/ssr — format cookie identik dengan app. */
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
  return { jar };
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
  return { status: res.status, json };
}

async function page(jar, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: jar }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

function seedAccount(roleKey) {
  const t = readFileSync("scripts/seed-dev.mjs", "utf8");
  const obj = t.match(new RegExp(`\\{[^{}]*role:\\s*['"]${roleKey}['"][^{}]*\\}`, "i"))?.[0] ?? "";
  const email = obj.match(/email:\s*['"]([^'"]+)['"]/)?.[1];
  const password = obj.match(/password:\s*['"]([^'"]+)['"]/)?.[1];
  return email && password ? { email, password } : null;
}

async function main() {
  console.log(`=== SP11 EVENT PAYMENT MGMT (${TAG}) ===`);
  const admAcc = seedAccount("admin");
  if (!admAcc) throw new Error("akun admin seed tak ditemukan di seed-dev.mjs");

  // ================= FIXTURE =================
  // (athletes tidak berkaitan langsung dgn training_groups; membership via tabel relasi — tidak dibutuhkan di sini)

  const mkUser = async (email, name, role) => {
    const { data: u } = await admin.auth.admin.createUser({
      email, password: "UjiPass99!", email_confirm: true, user_metadata: { full_name: name },
    });
    if (!u?.user) throw new Error(`createUser gagal ${email}`);
    await admin.from("profiles").update({ role, account_status: "ACTIVE", full_name: name }).eq("id", u.user.id);
    return u.user.id;
  };
  const adminUid = await mkUser(`${TAG}-adm@uji.local`, `${TAG} Admin`, "admin");
  const coachUid = await mkUser(`${TAG}-coach@uji.local`, `${TAG} Coach`, "coach");
  const parentUid = await mkUser(`${TAG}-parent@uji.local`, `${TAG} Parent`, "parent");

  const eid = await ins("events", {
    name: `${TAG} Kejuaraan Uji`, event_date: new Date().toISOString().slice(0, 10), status: "OPEN",
  });

  const insertRace = (name, price, is_free) =>
    admin.from("event_races").insert({
      event_id: eid, name,
      distance_m: is_free ? 25 : 50,
      stroke: name.startsWith("Estafet") ? "Free Estafet" : "Bebas",
      price, is_free,
    }).select("id").single();
  const race1 = await insertRace("50m Gaya Bebas", 50000, false);
  const race2 = await insertRace("25m Kick", 25000, false);
  const raceFree = await insertRace("Estafet Ceria", 0, true);
  if (!race1.data || !race2.data || !raceFree.data) throw new Error(`INSERT event_races gagal: ${race1.error?.message ?? race2.error?.message ?? raceFree.error?.message}`);

  const parentId = await ins("parents", { user_id: parentUid, full_name: `${TAG} Parent` });
  const mkAthlete = async (name) => ins("athletes", {
    full_name: name, cakra: "Cakra 2", parent_id: parentId, status: "ACTIVE",
  });
  const aidF = await mkAthlete(`${TAG} Felisia`);
  const aidB = await mkAthlete(`${TAG} Budi`);

  // FELISIA — BELUM_BAYAR Rp75.000 (dua race berbayar)
  // Urutan benar: registration -> entries (price_snapshot) -> payment (trigger hitung total).
  const regFId = await ins("event_registrations", {
    event_id: eid, athlete_id: aidF, ku: "KU IV", status: "REGISTERED",
  });
  for (const [rid, price] of [[race1.data.id, 50000], [race2.data.id, 25000]]) {
    await admin.from("event_registration_entries").insert({ registration_id: regFId, race_id: rid, price_snapshot: price });
  }
  const payFId = await ins("event_payments", {
    event_id: eid, registration_id: regFId, athlete_id: aidF, athlete_name: `${TAG} Felisia`, cakra: "Cakra 2",
    amount_paid: 0, payment_status: "BELUM_BAYAR", jumlah_nomor: 2,
  });
  await admin.from("event_registrations").update({ payment_id: payFId }).eq("id", regFId);

  // BUDI — MENUNGGU_VERIFIKASI Rp50.000 (satu berbayar + satu gratis)
  const regBId = await ins("event_registrations", {
    event_id: eid, athlete_id: aidB, ku: "KU IV", status: "REGISTERED",
  });
  for (const [rid, price] of [[race1.data.id, 50000], [raceFree.data.id, 0]]) {
    await admin.from("event_registration_entries").insert({ registration_id: regBId, race_id: rid, price_snapshot: price });
  }
  const payBId = await ins("event_payments", {
    event_id: eid, registration_id: regBId, athlete_id: aidB, athlete_name: `${TAG} Budi`, cakra: "Cakra 2",
    amount_paid: 50000, payment_status: "MENUNGGU_VERIFIKASI", jumlah_nomor: 2, payment_method: "Transfer Bank",
  });
  await admin.from("event_registrations").update({ payment_id: payBId }).eq("id", regBId);

  const adminSess = await browserSession(admAcc.email, admAcc.password);
  if (!adminSess) throw new Error("login admin seed gagal");
  const adminJar = adminSess.jar;
  const coachJar = (await browserSession(`${TAG}-coach@uji.local`, "UjiPass99!"))?.jar;
  const parentJar = (await browserSession(`${TAG}-parent@uji.local`, "UjiPass99!"))?.jar;

  try {
    // ---------- CASE 1: verify BELUM_BAYAR -> LUNAS ----------
    {
      const r = await api(adminJar, "/api/admin/event-payments", "PATCH",
        { payment_id: payFId, action: "verify", expected_status: "BELUM_BAYAR" });
      ok(r.status === 200 && r.json?.payment?.payment_status === "LUNAS", "CASE1 verify->LUNAS", `http=${r.status}`);
      const db = (await admin.from("event_payments")
        .select("payment_status, amount_paid, remaining_amount, verified_by, verified_at").eq("id", payFId).single()).data;
      ok(db?.payment_status === "LUNAS" && Number(db.amount_paid) === 75000 && !!db.verified_by && !!db.verified_at,
        "CASE1b DB verified_by/at terisi", JSON.stringify(db));
    }

    // ---------- CASE 2: detail event render LUNAS dari DB ----------
    {
      const p = await page(adminJar, `/events/${eid}`);
      ok(p.status === 200 && p.text.includes("LUNAS"), "CASE2 detail render LUNAS", `http=${p.status}`);
    }

    // ---------- CASE 3/4/5: /registrations + filter status bayar ----------
    {
      const all = await page(adminJar, "/registrations?pay=ALL");
      ok(all.status === 200 && all.text.includes(`${TAG} Felisia`), "CASE3 /registrations memuat Felisia", `http=${all.status}`);
      const belum = await page(adminJar, "/registrations?pay=BELUM_BAYAR");
      ok(belum.status === 200 && !belum.text.includes(`${TAG} Felisia`), "CASE4 filter BELUM_BAYAR tanpa Felisia", `http=${belum.status}`);
      // NOTE: saat CASE5 dijalankan, Felisia masih LUNAS dari CASE1
      const lumas = await page(adminJar, "/registrations?pay=LUNAS");
      ok(lumas.status === 200 && lumas.text.includes(`${TAG} Felisia`), "CASE5 filter LUNAS memuat Felisia", `http=${lumas.status}`);
    }

    // ---------- CASE 6: non-admin DENIED ----------
    for (const [who, j] of [["coach", coachJar], ["parent", parentJar]]) {
      const r = await api(j, "/api/admin/event-payments", "PATCH", { payment_id: payFId, action: "verify" });
      ok(r.status === 403, `CASE6 ${who} DENIED 403`, `http=${r.status}`);
    }

    // ---------- CASE 7: revert LUNAS -> BELUM_BAYAR ----------
    {
      const r = await api(adminJar, "/api/admin/event-payments", "PATCH",
        { payment_id: payFId, action: "set_status", payment_status: "BELUM_BAYAR", expected_status: "LUNAS", amount_paid: 0 });
      const db = (await admin.from("event_payments").select("payment_status, amount_paid, remaining_amount, verified_by, verified_at").eq("id", payFId).single()).data;
      ok(r.status === 200 && db?.payment_status === "BELUM_BAYAR" && Number(db.amount_paid) === 0 && db?.verified_by === null,
        "CASE7 revert konsisten + verifikasi bersih", `api=${r.status} db=${JSON.stringify(db)}`);
    }

    // ---------- CASE 8: UPDATE bukan INSERT duplikat ----------
    {
      const nBefore = (await admin.from("event_payments").select("id").eq("athlete_id", aidF)).data.length;
      const r = await api(adminJar, "/api/admin/event-payments", "PATCH",
        { payment_id: payFId, action: "set_status", payment_status: "DP", expected_status: "BELUM_BAYAR" });
      const nAfter = (await admin.from("event_payments").select("id").eq("athlete_id", aidF)).data.length;
      ok(nBefore === 1 && nAfter === 1 && r.status === 200, "CASE8 update tanpa duplikat", `n=${nBefore}->${nAfter} http=${r.status}`);
    }

    // ---------- CASE 9: free race tak menambah tagihan ----------
    {
      const pb = (await admin.from("event_payments").select("total_amount").eq("id", payBId).single()).data;
      ok(Number(pb?.total_amount) === 50000, "CASE9 free race total tetap 50rb", `total=${pb?.total_amount}`);
    }

    // ---------- CASE 10: dashboard keuangan hidup & agregat DB benar ----------
    {
      const fin = await page(adminJar, "/keuangan");
      ok(fin.status === 200, "CASE10 /keuangan 200", `http=${fin.status}`);
      const agg = (await admin.from("event_payments").select("amount_paid").eq("payment_status", "LUNAS").eq("event_id", eid)).data ?? [];
      const sum = agg.reduce((s, x) => s + Number(x.amount_paid), 0);
      ok(sum === 0, "CASE10b agregat LUNAS event uji = 0 (semua direvert/DP)", `sum=${sum}`);
    }

    // ---------- EXTRA: audit log tercatat ----------
    {
      const logs = (await admin.from("audit_logs").select("action").eq("entity_id", payFId)).data ?? [];
      ok(logs.length >= 3, "EXTRA audit_logs >=3", `n=${logs.length}`);
      ok(logs.some((l) => l.action === "UPDATE_EVENT_PAYMENT_STATUS"), "EXTRA action UPDATE_EVENT_PAYMENT_STATUS ada", "");
    }

    // ---------- EXTRA: concurrency guard ----------
    {
      const r = await api(adminJar, "/api/admin/event-payments", "PATCH",
        { payment_id: payFId, action: "verify", expected_status: "DITOLAK" });
      ok(r.status === 409, "EXTRA expected_status mismatch -> 409", `http=${r.status}`);
    }

    // ---------- EXTRA: cancel registration ----------
    {
      const r = await api(adminJar, "/api/admin/event-payments", "PATCH", { payment_id: payBId, action: "cancel" });
      const reg = (await admin.from("event_registrations").select("status").eq("id", regBId).single()).data;
      ok(r.status === 200 && reg?.status === "CANCELLED", "EXTRA cancel: payment CANCELLED + reg CANCELLED", `api=${r.status} reg=${reg?.status}`);
    }
  } finally {
    // ================= CLEANUP =================
    await admin.from("audit_logs").delete().in("entity_id", [payFId, payBId].filter(Boolean));
    await admin.from("event_registration_entries").delete().in("registration_id", [regFId, regBId].filter(Boolean));
    await admin.from("event_registrations").delete().in("id", [regFId, regBId].filter(Boolean));
    await admin.from("event_payments").delete().in("id", [payFId, payBId].filter(Boolean));
    if (eid) await admin.from("event_races").delete().eq("event_id", eid);
    if (eid) await admin.from("events").delete().eq("id", eid);
    await admin.from("athletes").delete().in("id", [aidF, aidB].filter(Boolean));
    await admin.from("parents").delete().eq("id", parentId);
    await admin.from("profiles").delete().in("id", [adminUid, coachUid, parentUid].filter(Boolean));
    for (const uid of [adminUid, coachUid, parentUid].filter(Boolean)) await admin.auth.admin.deleteUser(uid);
    console.log("cleanup selesai");
  }

  console.log(`\n=== HASIL: ${nPass} PASS / ${nFail} FAIL ===`);
  if (fails.length) { console.log(fails.join("\n")); process.exit(1); }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
