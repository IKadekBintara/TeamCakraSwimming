/**
 * TEST FASE 1b: CANCELLED registration tidak memblokir pendaftaran ulang.
 * Skenario: daftar → gagal duplikat aktif → cancel → daftar lagi SUKSES → duplikat aktif ditolak →
 *           cancel lagi → daftar lagi sukses → tanpa orphan → athlete utuh → cleanup penuh.
 * Mengetes: partial unique index + guard trigger + FK chain (entries/payments) — predikat sama dengan RPC.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const TAG = "ZZTEST-REGR-1B";
let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => { if (cond) { pass++; console.log(`PASS ${label}${extra ? " — " + extra : ""}`); } else { fail++; console.log(`FAIL ${label}${extra ? " — " + extra : ""}`); } };

// --- pre-cleanup: data uji lama bertag ZZTEST (hanya milik test ini) ---
{
  const { data: oldAth } = await sb.from("athletes").select("id").ilike("full_name", "ZZTEST%");
  const { data: oldEv } = await sb.from("events").select("id").ilike("name", "ZZTEST%");
  if (oldAth?.length) {
    const ids = oldAth.map((a) => a.id);
    await sb.from("event_registration_entries").delete().in("registration_id", (await sb.from("event_registrations").select("id").in("athlete_id", ids)).data?.map((r) => r.id) ?? ["00000000-0000-0000-0000-000000000000"]);
    await sb.from("excel_sync_jobs").delete().in("registration_id", (await sb.from("event_registrations").select("id").in("athlete_id", ids)).data?.map((r) => r.id) ?? ["00000000-0000-0000-0000-000000000000"]);
    await sb.from("event_payments").delete().in("athlete_id", ids);
    await sb.from("event_registrations").delete().in("athlete_id", ids);
    await sb.from("athletes").delete().in("id", ids);
    console.log(`pre-cleanup: ${ids.length} atlet uji lama dihapus`);
  }
  if (oldEv?.length) {
    const ids = oldEv.map((e) => e.id);
    await sb.from("event_races").delete().in("event_id", ids);
    await sb.from("excel_sync_jobs").delete().in("event_id", ids);
    await sb.from("events").delete().in("id", ids);
    console.log(`pre-cleanup: ${ids.length} event uji lama dihapus`);
  }
}

// baseline diambil SETELAH pre-cleanup agar perbandingan valid
const [{ count: athBefore }, { count: evBefore }, { count: payBefore }, { count: jobBefore }] = await Promise.all([
  sb.from("athletes").select("*", { count: "exact", head: true }),
  sb.from("events").select("*", { count: "exact", head: true }),
  sb.from("event_payments").select("*", { count: "exact", head: true }),
  sb.from("excel_sync_jobs").select("*", { count: "exact", head: true }),
]);
console.log(`BASELINE athletes=${athBefore} events=${evBefore} payments=${payBefore} jobs=${jobBefore}`);

// --- setup: event uji + atlet uji ---
const { data: ev, error: evErr } = await sb.from("events").insert({
  name: TAG, event_date: "2026-12-31", fee_per_entry: 55000, admin_fee: 20000, status: "OPEN", updated_at: new Date().toISOString(),
}).select("id").single();
ok(!evErr, "event uji dibuat", evErr?.message);

const { data: ath, error: athErr } = await sb.from("athletes").insert({
  full_name: "ZZTEST ATLET REGRESSION", birth_date: "2015-01-01", gender: "M", status: "ACTIVE", join_date: "2026-01-01",
}).select("id").single();
ok(!athErr, "atlet uji dibuat", athErr?.message);

const { data: race, error: raceErr } = await sb.from("event_races").insert({ event_id: ev.id, name: "50m Gaya Bebas TEST", is_active: true, distance_m: 50, stroke: "Gaya Bebas" }).select("id").single();
ok(!raceErr, "nomor lomba uji dibuat", raceErr?.message);

const regPayload = { event_id: ev.id, athlete_id: ath.id, ku: "KU II", status: "REGISTERED", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

// --- 1) daftar pertama: sukses ---
const { data: r1, error: r1e } = await sb.from("event_registrations").insert(regPayload).select("id").single();
ok(!r1e, "T1 daftar pertama BERHASIL", r1e?.message);

// --- 2) duplikat AKTIF harus ditolak ---
const { error: r2e } = await sb.from("event_registrations").insert(regPayload);
ok(!!r2e, "T2 duplikat AKTIF DITOLAK", r2e?.message?.slice(0, 60));

// --- 3) payment untuk reg1 lalu cancel keduanya ---
const { data: pay1, error: p1e } = await sb.from("event_payments").insert({
  athlete_id: ath.id, event_id: ev.id, registration_id: r1.id, athlete_name: "ZZTEST ATLET REGRESSION",
  jumlah_nomor: 1, registration_fee: 0, admin_fee: 0, total_amount: 0, amount_paid: 0, remaining_amount: 0,
  payment_status: "BELUM_BAYAR", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}).select("id, total_amount").single();
ok(!p1e, "payment reg1 dibuat (trigger total aktif)", p1e?.message ? p1e.message.slice(0, 60) : `total=${pay1?.total_amount}`);

await sb.from("event_payments").update({ payment_status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", pay1.id);
await sb.from("event_registrations").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", r1.id);

const { data: activeCount } = await sb.from("event_registrations").select("id", { count: "exact", head: true }).eq("athlete_id", ath.id).eq("event_id", ev.id).eq("status", "REGISTERED");
ok((activeCount?.length ?? 0) === 0 || activeCount === null, "T3 setelah cancel, tidak ada registrasi aktif");

// --- 4) daftar ULANG setelah cancel: HARUS BERHASIL (inti perbaikan) ---
const { data: r2, error: r3e } = await sb.from("event_registrations").insert({ ...regPayload }).select("id").single();
ok(!r3e, "T4 daftar ULANG setelah CANCELLED BERHASIL", r3e?.message?.slice(0, 60));

// --- 5) duplikat aktif kedua tetap ditolak (partial index + guard) ---
const { error: r4e } = await sb.from("event_registrations").insert(regPayload);
ok(!!r4e, "T5 duplikat aktif ke-2 DITOLAK", r4e?.message?.slice(0, 60));

// --- 6) boleh ada >1 baris CANCELLED untuk pasangan sama (tidak dianggap duplikat) ---
await sb.from("event_registrations").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", r2.id);
const { data: r3, error: r5e } = await sb.from("event_registrations").insert({ ...regPayload }).select("id").single();
ok(!r5e, "T6 daftar ulang KEDUA kalinya juga BERHASIL (2x CANCELLED tersimpan)", r5e?.message?.slice(0, 60));

// --- 7) integritas: tidak ada orphan; athlete utuh; id konsisten ---
const { data: regs } = await sb.from("event_registrations").select("id, status").eq("athlete_id", ath.id).eq("event_id", ev.id);
const regIds = regs.map((r) => r.id);
const { data: entries } = await sb.from("event_registration_entries").select("registration_id").eq("race_id", race.id);
const orphanEntries = (entries ?? []).filter((e) => !regIds.includes(e.registration_id));
ok(orphanEntries.length === 0, "T7a tidak ada orphan entries");

const { data: pays } = await sb.from("event_payments").select("registration_id, payment_status").eq("athlete_id", ath.id).eq("event_id", ev.id);
const orphanPays = (pays ?? []).filter((p) => !regIds.includes(p.registration_id));
ok(orphanPays.length === 0, "T7b tidak ada orphan payments");
const cancelledRegIds = new Set(regs.filter((r) => r.status === "CANCELLED").map((r) => r.id));
const payOfCancelled = (pays ?? []).filter((p) => cancelledRegIds.has(p.registration_id));
ok(payOfCancelled.every((p) => p.payment_status === "CANCELLED"), "T7c semua payment milik registrasi batal berstatus CANCELLED", `${payOfCancelled.length}/${cancelledRegIds.size}`);

const { data: athCheck } = await sb.from("athletes").select("id, full_name, status").eq("id", ath.id).single();
ok(athCheck?.id === ath.id && athCheck?.status === "ACTIVE", "T7d atlet utuh, athlete_id tetap", athCheck?.id.slice(0, 8));

// --- cleanup penuh (by UUID, data uji saja) ---
await sb.from("event_registration_entries").delete().in("registration_id", regIds);
await sb.from("event_payments").delete().eq("athlete_id", ath.id).eq("event_id", ev.id);
await sb.from("event_registrations").delete().in("id", regIds);
await sb.from("event_races").delete().eq("id", race.id);
await sb.from("excel_sync_jobs").delete().in("registration_id", regIds.length ? regIds : ["00000000-0000-0000-0000-000000000000"]);
await sb.from("events").delete().eq("id", ev.id);
await sb.from("athletes").delete().eq("id", ath.id);

// sisa jejak uji?
const [{ count: regLeft }, { count: evLeft }, { count: athLeft }] = await Promise.all([
  sb.from("event_registrations").select("*", { count: "exact", head: true }).eq("athlete_id", ath.id),
  sb.from("events").select("*", { count: "exact", head: true }).eq("id", ev.id),
  sb.from("athletes").select("*", { count: "exact", head: true }).eq("id", ath.id),
]);
ok(!regLeft && !evLeft && !athLeft, "CLEANUP: tidak ada jejak data uji");

const [{ count: athAfter }, { count: evAfter }, { count: payAfter }, { count: jobAfter }] = await Promise.all([
  sb.from("athletes").select("*", { count: "exact", head: true }),
  sb.from("events").select("*", { count: "exact", head: true }),
  sb.from("event_payments").select("*", { count: "exact", head: true }),
  sb.from("excel_sync_jobs").select("*", { count: "exact", head: true }),
]);
console.log(`AFTER athletes=${athAfter} (before ${athBefore}) events=${evAfter} (${evBefore}) payments=${payAfter} (${payBefore}) jobs=${jobAfter} (${jobBefore})`);
ok(Number(athAfter) === Number(athBefore) && Number(evAfter) === Number(evBefore) && Number(payAfter) === Number(payBefore), "T8 count tabel produksi KEMBALI = baseline");

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
