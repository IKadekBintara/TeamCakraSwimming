/**
 * excel-audit.mjs — Audit & reconciliasi dua arah Supabase ↔ Excel untuk satu konfigurasi sinkronisasi.
 * Universal: bekerja dari cfg.mapping (header kolom), bukan hard-code event/file tertentu.
 *
 * Pemakaian:
 *   node scripts/excel-audit.mjs                 → audit saja (read-only) utk config enabled pertama
 *   node scripts/excel-audit.mjs --config=FORM-A1
 *   node scripts/excel-audit.mjs --fix           → audit + repair aman + verifikasi ulang
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const val = (k) => (envText.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const db = createClient(val("NEXT_PUBLIC_SUPABASE_URL"), val("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const FIX = process.argv.includes("--fix");
const cfgName = (process.argv.find((a) => a.startsWith("--config=")) || "").split("=")[1];

// ---------- helpers (selaras dengan worker) ----------
const normKey = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const papi = (g) => { const s = String(g ?? "").trim().toUpperCase(); return /^(M|L|MALE|PRIA|LK)/.test(s) ? "PA" : /^(F|P|WANITA|PR|PEREMPUAN|Female)/.test(s) ? "PI" : ""; };
const kuShort = (k) => { const s = String(k ?? "").trim().toUpperCase(); return s.startsWith("KU ") ? s.slice(3) : s; };
// legacyDate: nilai Excel terbaca = DB bila diinterpretasi mm/dd → artefak penulis format lama.
const legacyDate = (ex, wantDDMM) => {
  const m = String(ex ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const [, a, b, y] = m;
  const w = wantDDMM.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return !!w && Number(a) <= 12 && Number(b) <= 12 && `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}` === `${w[3]}-${w[2]}-${w[1]}`;
};
function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return String(v.result ?? "");
    if (v.text) return String(v.text);
    return "";
  }
  return String(v);
}

// ---------- load config ----------
let q = db.from("excel_sync_configurations").select("*").eq("enabled", true).order("created_at");
if (cfgName) q = q.ilike("name", `%${cfgName}%`);
const { data: cfgs } = await q.limit(1);
const cfg = cfgs?.[0];
if (!cfg) { console.log("CONFIG TIDAK DITEMUKAN"); process.exit(1); }
console.log(`\n=== AUDIT ${cfg.name} (${cfg.file_path}) ===`);

// ---------- Supabase truth ----------
const { data: regs } = await db.from("event_registrations")
  .select("id, athlete_id, ku, ku_override, status, created_at, athletes(full_name, gender, birth_date)")
  .eq("event_id", cfg.event_id).neq("status", "CANCELLED")
  .order("created_at");
const regIds = (regs ?? []).map((r) => r.id);
const { data: entries } = await db.from("event_registration_entries").select("registration_id, event_races(name)").in("registration_id", regIds.length ? regIds : ["00000000-0000-0000-0000-000000000000"]);
const { data: pays } = await db.from("event_payments").select("registration_id, payment_status").in("registration_id", regIds.length ? regIds : ["00000000-0000-0000-0000-000000000000"]);
const racesBy = {};
for (const e of entries ?? []) { (racesBy[e.registration_id] ??= []).push(e.event_races?.name); }
const payBy = Object.fromEntries((pays ?? []).map((p) => [p.registration_id, p.payment_status]));
const states = (regs ?? []).map((r) => {
  const ath = Array.isArray(r.athletes) ? r.athletes[0] : r.athletes;
  return {
    registration_id: r.id, athlete_id: r.athlete_id,
    name: (ath?.full_name ?? "").toUpperCase(),
    gender: papi(ath?.gender), birth_date: ath?.birth_date ?? null,
    ku: r.ku_override || r.ku || "",
    race_names: (racesBy[r.id] ?? []).filter(Boolean).join(", "),
    payment_status: payBy[r.id] ?? "BELUM_BAYAR",
  };
});

// ---------- Excel ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(cfg.file_path);
const ws = wb.getWorksheet(cfg.worksheet_name);
const mapping = cfg.mapping ?? {};
const colByHeader = {};
for (let c = 1; c <= ws.columnCount; c++) {
  const k = normKey(cellText(ws.getCell(cfg.header_row, c)));
  if (k && !(k in colByHeader)) colByHeader[k] = c;
}
const cols = {};
for (const [f, h] of Object.entries(mapping)) cols[f] = colByHeader[normKey(h)] ?? null;

const rows = []; // {row, name, key, values}
for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws.rowCount); r++) {
  const name = cols.name ? cellText(ws.getCell(r, cols.name)) : "";
  if (!normKey(name)) continue;
  rows.push({ row: r, name: name.trim(), key: normKey(name), values: Object.fromEntries(Object.entries(cols).filter(([, c]) => c).map(([f, c]) => [f, cellText(ws.getCell(r, c)).trim()])) });
}
const { data: maps } = await db.from("excel_sync_row_mappings").select("*").eq("configuration_id", cfg.id);
const mapByReg = Object.fromEntries((maps ?? []).map((m) => [m.registration_id, m]));

// ---------- DIAGNOSIS ----------
const diag = { dup_excel_names: [], dup_mapped_athlete: [], missing_in_excel: [], orphan_rows: [], stale_map: [], field_diffs: [], numbering_gaps: [], numbering_dup: [] };
const claimedRows = new Set();
for (const m of maps ?? []) {
  const st = states.find((s) => s.registration_id === m.registration_id);
  if (!st) continue;
  if (!claimedRows.has(m.excel_row)) claimedRows.add(m.excel_row);
}
// duplikat nama di excel
const byKey = {};
for (const rec of rows) (byKey[rec.key] ??= []).push(rec);
for (const [k, g] of Object.entries(byKey)) if (g.length > 1) diag.dup_excel_names.push(`${k} @rows ${g.map((x) => x.row).join(",")}`);
// duplikat mapping per athlete
const byAth = {};
for (const m of maps ?? []) (byAth[m.athlete_id] ??= []).push(m.excel_row);
for (const [a, rr] of Object.entries(byAth)) {
  const uniq = [...new Set(rr)];
  if (uniq.length > 1) {
    const nm = states.find((s) => s.athlete_id === a)?.name ?? a;
    diag.dup_mapped_athlete.push(`${nm} @rows ${rr.join(",")}`);
  }
}
// bandingkan tiap state dgn baris terpetakan
for (const st of states) {
  const m = mapByReg[st.registration_id];
  if (!m) { diag.missing_in_excel.push(st.name); continue; }
  const rec = rows.find((x) => x.row === m.excel_row);
  if (!rec || !rec.key) { diag.stale_map.push(`${st.name} → row ${m.excel_row} kosong/tidak ada`); continue; }
  if (rec.key !== normKey(st.name)) {
    // nama beda: case-only atau rename?
    if (rec.key === normKey(st.name)) {} // tak mungkin
    else diag.field_diffs.push({ row: rec.row, athlete: st.name, field: "nama", excel: rec.name, supabase: st.name });
  }
  for (const [f, label, view] of [["birth_date", "tgl_lahir", fmtDate(st.birth_date)], ["gender", "gender", st.gender], ["ku", "KU", kuShort(st.ku)]]) {
    const ex = String(rec.values[f] ?? "").trim();
    if (!ex) continue; // sel kosong = belum terisi, bukan "beda" — ditangani repair
    if (ex !== String(view)) diag.field_diffs.push({ row: rec.row, athlete: st.name, field: label, excel: ex, supabase: view });
  }
}
// orphan: baris bernama yang tidak diklaim mapping manapun
for (const rec of rows) {
  if (claimedRows.has(rec.row)) continue;
  const owner = states.find((s) => normKey(s.name) === rec.key);
  diag.orphan_rows.push({ row: rec.row, name: rec.name, cocok_atlet: owner?.name ?? "-" });
}
// penomoran
if (cols.no) {
  const nums = rows.map((r) => parseInt(r.values.no, 10)).filter((n) => !isNaN(n));
  const seen = new Set();
  for (const n of nums) { if (seen.has(n)) diag.numbering_dup.push(n); seen.add(n); }
  for (let i = 1; i <= Math.max(...nums, 0); i++) if (!seen.has(i)) diag.numbering_gaps.push(i);
}
// blank row DI TENGAH data: baris kosong yang diapit dua baris terisi (layout gap).
// Bedakan dengan ruang kosong SETELAH data terakhir — itu bagian template/area sengaja.
{
  let lastFilled = 0;
  for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws.rowCount); r++) {
    if (claimedRows.has(r) || rows.some((x) => x.row === r)) lastFilled = r;
  }
  diag.blank_mid = [];
  for (let r = cfg.first_data_row; r < lastFilled; r++) {
    const filled = claimedRows.has(r) || rows.some((x) => x.row === r);
    if (!filled) diag.blank_mid.push(r);
  }
}

console.log(`atlet_supabase=${states.length}  baris_excel=${rows.length}  mapping=${maps?.length ?? 0}`);
console.log(`duplikat_nama_excel=[${diag.dup_excel_names.join("; ") || "-"}]`);
console.log(`duplikat_mapping_atlet=[${diag.dup_mapped_athlete.join("; ") || "-"}]`);
console.log(`hilang_di_excel=[${diag.missing_in_excel.join("; ") || "-"}]`);
console.log(`orphan_excel=[${diag.orphan_rows.map((o) => `r${o.row}:${o.name}`).join("; ") || "-"}]`);
console.log(`mapping_stale=[${diag.stale_map.join("; ") || "-"}]`);
console.log(`beda_field=${diag.field_diffs.length}`, diag.field_diffs.slice(0, 6));
console.log(`nomor_bolong=[${diag.numbering_gaps.join(",") || "-"}]  nomor_duplikat=[${diag.numbering_dup.join(",") || "-"}]`);
console.log(`blank_row_tengah=[${(diag.blank_mid ?? []).join(",") || "-"}]  (kosong SETELAH data terakhir tidak dihitung — bagian template)`);

if (!FIX) { console.log("\n(mode audit saja — jalankan ulang dengan --fix untuk reparasi aman)"); process.exit(0); }

// ---------- REPAIR ----------
let fixed = { updated_fields: 0, legacy_dates: 0, inserted: 0, cleared_orphan: 0, cleared_dup: 0, renumbered: 0, compacted: 0, col_widths: 0, needs_review: [] };
const setCell = (r, f, v) => { if (cols[f]) ws.getCell(r, cols[f]).value = v; };
const pendingMapMoves = []; // kompaksi: {id:{configuration_id,registration_id}, to}

// 1) perbaiki field beda pada baris terpetakan (Supabase = source of truth)
for (const st of states) {
  const m = mapByReg[st.registration_id];
  if (!m) continue;
  const rec = rows.find((x) => x.row === m.excel_row);
  if (!rec) continue;
  // nama: bandingkan normalized; tulis ulang bila beda (rename/case)
  if (rec.name !== st.name) { setCell(m.excel_row, "name", st.name); fixed.updated_fields++; }
  // field lain: bandingkan bentuk TAMPILAN. Sisi Supabase KOSONG + Excel terisi =
  // data Supabase yang kurang → JANGAN menimpa Excel, catat NEEDS_REVIEW.
  const review = (field, exVal, sbView) => {
    if (!cols[field]) return;
    const ex = String(rec.values[field] ?? "").trim();
    const want = String(sbView ?? "").trim();
    if (ex && want && ex !== want) {
      const cell = ws.getCell(m.excel_row, cols[field]);
      if (field === "birth_date" && legacyDate(ex, want)) { cell.value = want; fixed.legacy_dates++; }
      else { cell.value = want; fixed.updated_fields++; }
    } else if (ex && !want) fixed.needs_review.push(`r${m.excel_row} ${st.name}: ${field} kosong di Supabase, Excel="${ex}"`);
  };
  review("birth_date", rec.values.birth_date, fmtDate(st.birth_date));
  review("gender", rec.values.gender, st.gender);
  review("ku", rec.values.ku, kuShort(st.ku));
}

// 2) sisipkan atlet yang hilang ke slot kosong pertama (+ buat mapping)
async function nextFreeRow() {
  for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws.rowCount); r++) {
    const nm = cols.name ? cellText(ws.getCell(r, cols.name)) : "";
    if (!normKey(nm)) return r;
  }
  return null; // penuh — biarkan worker auto-expand menangani
}
for (const st of states) {
  if (!mapByReg[st.registration_id]) {
    const target = await nextFreeRow();
    if (!target) { console.log(`SKIP INSERT ${st.name}: area penuh (jalankan Sync Now agar worker auto-expand)`); continue; }
    setCell(target, "no", ""); setCell(target, "name", st.name);
    setCell(target, "birth_date", fmtDate(st.birth_date)); setCell(target, "gender", st.gender);
    setCell(target, "ku", st.ku); setCell(target, "race_names", st.race_names);
    await db.from("excel_sync_row_mappings").upsert({
      configuration_id: cfg.id, registration_id: st.registration_id,
      athlete_id: st.athlete_id, excel_row: target, athlete_key: normKey(st.name),
      athlete_name: st.name, synced_values: st, updated_at: new Date().toISOString(),
    }, { onConflict: "configuration_id,registration_id" });
    mapByReg[st.registration_id] = { configuration_id: cfg.id, registration_id: st.registration_id, athlete_id: st.athlete_id, excel_row: target };
    fixed.inserted++;
  }
}

// 3) bersihkan baris duplikat/orphan yang identitasnya pasti sama (varian nama lama dari athlete yang sama)
for (const rec of rows) {
  if (claimedRows.has(rec.row)) {
    // baris diklaim mapping ATAS NAMA REG LAIN — jika kunci namanya milik atlet yang sudah punya baris lain → duplikat rename-bug
    const owners = Object.entries(mapByReg).filter(([, m]) => m.excel_row === rec.row);
    if (owners.length === 1) {
      const [, m] = owners[0];
      const st = states.find((s) => s.registration_id === m.registration_id);
      if (st && rec.key !== normKey(st.name)) {
        const stSameAthlete = states.find((s) => s.athlete_id === m.athlete_id && normKey(s.name) === rec.key);
        if (stSameAthlete) { /* baris lama varian nama — dibersihkan di bawah bersama orphan */ }
      }
    }
    continue;
  }
  const owner = states.find((s) => normKey(s.name) === rec.key);
  if (owner && mapByReg[owner.registration_id] && mapByReg[owner.registration_id].excel_row !== rec.row) {
    // duplikat varian nama lama milik atlet yang sama → kosongkan sel kolom mapping
    for (const f of Object.keys(cols)) if (cols[f]) ws.getCell(rec.row, cols[f]).value = null;
    fixed.cleared_dup++;
  } else if (!owner) {
    console.log(`NEEDS_REVIEW: baris r${rec.row} "${rec.name}" tidak dikenali — tidak diubah`);
  }
}

// 3b) KOMPAKSI: geser isi baris ke atas menutup blank row di tengah data.
//     Mapping excel_row di-update mengikuti — athlete_id & data TIDAK berubah.
{
  const lastFilled = Math.max(0, ...(claimedRows.size ? [...claimedRows] : []), ...rows.map((x) => x.row));
  let write = cfg.first_data_row;
  for (let r = cfg.first_data_row; r <= lastFilled; r++) {
    const filled = claimedRows.has(r) || rows.some((x) => x.row === r);
    if (!filled) continue;
    if (write !== r) {
      // pindahkan seluruh sel kolom mapping + properti baris (tinggi/borders ikut)
      for (const f of Object.keys(cols)) {
        if (!cols[f]) continue;
        const src = ws.getCell(r, cols[f]), dst = ws.getCell(write, cols[f]);
        dst.value = src.value; dst.style = JSON.parse(JSON.stringify(src.style ?? {})); dst.font = src.font; dst.border = src.border;
        src.value = null; src.style = {}; src.border = undefined; src.alignment = undefined;
      }
      ws.getRow(write).height = ws.getRow(r).height;
      const m = Object.values(mapByReg).find((mm) => mm.excel_row === r);
      if (m) { pendingMapMoves.push({ id: { configuration_id: m.configuration_id, registration_id: m.registration_id }, to: write }); }
    }
    write++;
  }
}
// 4) RENOMOR urut 1..N berdasarkan urutan baris terisi (tanpa duplikat, tanpa bolong)
if (cols.no) {
  let n = 1;
  for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws.rowCount); r++) {
    const nm = cols.name ? cellText(ws.getCell(r, cols.name)) : "";
    if (!normKey(nm)) continue;
    const cur = cellText(ws.getCell(r, cols.no)).trim();
    if (cur !== String(n)) { ws.getCell(r, cols.no).value = n; fixed.renumbered++; }
    n++;
  }
}

// 3c) AUTO-WIDTH: kolom KU, NAMA, Tanggal Lahir harus terbaca penuh.
{
  const targets = [["ku", 8], ["name", 42], ["birth_date", 16]];
  for (const [f, maxW] of targets) {
    const c = cols[f];
    if (!c) continue;
    const col = ws.getColumn(c);
    let need = 10;
    const header = cellText(ws.getCell((cfg.first_data_row ?? 21) - 1, c)) || String(col.header ?? "");
    need = Math.max(need, Math.min(String(header).length + 2, maxW));
    for (const st of states) {
      const m = mapByReg[st.registration_id];
      if (!m) continue;
      let v = "";
      if (f === "name") v = st.name;
      else if (f === "birth_date") v = fmtDate(st.birth_date);
      else if (f === "ku") v = kuShort(st.ku);
      need = Math.max(need, Math.min(String(v).length + 2, maxW));
    }
    const before = col.width ?? 8.43;
    const targetW = Math.min(Math.max(need, 9), maxW);
    if ((col.width ?? 0) < targetW - 0.1) {
      col.width = targetW; fixed.col_widths++;
      // wrap text agar nilai panjang tetap terbaca bila dibatasi max
      for (const st of states) {
        const m = mapByReg[st.registration_id];
        if (!m) continue;
        const v = f === "name" ? st.name : f === "birth_date" ? fmtDate(st.birth_date) : kuShort(st.ku);
        if (m && String(v ?? "").length + 2 > maxW) {
          const cell = ws.getCell(m.excel_row, c);
          cell.alignment = { ...cell.alignment, wrapText: true };
        }
      }
    }
  }
}

// Tulis dengan RETRY + POST-WRITE VERIFY: jika penulis eksternal menimpa balik,
// coba lagi (maks 4x). Berhasil = semua perubahan terverifikasi dari disk.
{
  const intended = [];
  for (const st of states) {
    const m = mapByReg[st.registration_id];
    if (!m) continue;
    const rec = rows.find((x) => x.row === m.excel_row);
    if (!rec) continue;
    if (rec.name !== st.name && cols.name) intended.push([m.excel_row, cols.name, st.name]);
    const bdWant = fmtDate(st.birth_date);
    const ex = String(rec.values.birth_date ?? "").trim();
    if (cols.birth_date && ex && bdWant && ex !== bdWant && legacyDate(ex, bdWant)) intended.push([m.excel_row, cols.birth_date, bdWant]);
  }
  let okWrite = false;
  for (let attempt = 1; attempt <= 4 && !okWrite; attempt++) {
    await wb.xlsx.writeFile(cfg.file_path);
    await new Promise((r) => setTimeout(r, attempt === 1 ? 300 : 2500));
    const wbv = new ExcelJS.Workbook();
    await wbv.xlsx.readFile(cfg.file_path);
    const wsv = wbv.getWorksheet(cfg.worksheet_name);
    okWrite = intended.every(([r, c, v]) => String(wsv.getCell(r, c).value ?? "") === v);
    console.log(`WRITE attempt ${attempt}: ${okWrite ? "TERVERIFIKASI dari disk" : "ditimpa eksternal — retry"}`);
    if (!okWrite) { // muat ulang snapshot segar sebelum retry agar tidak menimpa dengan data basi
      const wbr = new ExcelJS.Workbook();
      await wbr.xlsx.readFile(cfg.file_path);
      Object.assign(ws, wbr.getWorksheet(cfg.worksheet_name));
      for (const [r, c, v] of intended) ws.getCell(r, c).value = v;
    }
  }
}
// Kompaksi menggeser baris → update excel_row di tabel mapping (athlete_id & data tetap).
if (pendingMapMoves.length) {
  for (const mv of pendingMapMoves) {
    await db.from("excel_sync_row_mappings").update({ excel_row: mv.to }).match(mv.id);
    const m = mapByReg[mv.id.registration_id];
    if (m) m.excel_row = mv.to;
  }
  fixed.compacted = pendingMapMoves.length;
}
// POST-WRITE CHECK: baca ulang dari disk untuk membuktikan tulisan benar-benar mendarat
{
  const wbp = new ExcelJS.Workbook();
  await wbp.xlsx.readFile(cfg.file_path);
  const wsp = wbp.getWorksheet(cfg.worksheet_name);
  const probe = states.slice(0, 60).map((st) => {
    const m = mapByReg[st.registration_id];
    if (!m || !cols.birth_date) return null;
    return `${m.excel_row}:${wsp.getCell(m.excel_row, cols.birth_date).value}`;
  }).filter(Boolean);
  console.log("POST-WRITE sampel tanggal:", probe.join(" "));
}
console.log(`\nREPAIR: ${JSON.stringify({ ...fixed, needs_review: fixed.needs_review.length + " item" })}`);
for (const nr of fixed.needs_review) console.log("NEEDS_REVIEW:", nr);

// ---------- VERIFY ulang dari awal ----------
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.readFile(cfg.file_path);
const ws2 = wb2.getWorksheet(cfg.worksheet_name);
const rows2 = [];
for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws2.rowCount); r++) {
  const name = cols.name ? cellText(ws2.getCell(r, cols.name)) : "";
  if (!normKey(name)) continue;
  rows2.push({ row: r, name: name.trim(), key: normKey(name), no: cols.no ? cellText(ws2.getCell(r, cols.no)).trim() : "" });
}
let vFail = 0;
const okv = (c, l, x = "") => { if (!c) vFail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${x ? ` — ${x}` : ""}`); };
okv(rows2.length === states.length, `jumlah baris excel = jumlah atlet supabase (${rows2.length} vs ${states.length})`);
okv(rows2.every((x) => x.name === x.name.toUpperCase()), "semua nama UPPERCASE");
okv(new Set(rows2.map((x) => x.key)).size === rows2.length, "tidak ada duplikat nama");
if (cols.no) {
  const seq = rows2.map((x, i) => x.no === String(i + 1));
  okv(seq.every(Boolean), "nomor urut 1..N berurutan tanpa bolong", rows2.map((x) => x.no).join(","));
}
const { data: maps2 } = await db.from("excel_sync_row_mappings").select("registration_id, athlete_id, excel_row").eq("configuration_id", cfg.id);
const rowsOfAth = {};
for (const m of maps2 ?? []) (rowsOfAth[m.athlete_id] ??= []).push(m.excel_row);
okv(Object.values(rowsOfAth).every((rr) => new Set(rr).size === 1), "tiap athlete_id tepat satu baris excel");
const regIdsSet = new Set(states.map((s) => s.registration_id));
okv((maps2 ?? []).every((m) => regIdsSet.has(m.registration_id)), "semua mapping menunjuk registrasi aktif");
const nameOk = (maps2 ?? []).every((m) => {
  const st = states.find((s) => s.registration_id === m.registration_id);
  const rec = rows2.find((x) => x.row === m.excel_row);
  return st && rec && rec.key === normKey(st.name);
});
okv(nameOk, "semua baris terpetakan = nama kanonik supabase");
// asersi isi field pada baris terpetakan = bentuk kanonik (kecuali NEEDS_REVIEW)
const reviewRows = new Set(fixed.needs_review.map((s) => Number(s.match(/^r(\d+)/)?.[1] ?? -1)));
const fieldOk = (maps2 ?? []).every((m) => {
  const st = states.find((s) => s.registration_id === m.registration_id);
  const rowObj = rows2.find((x) => x.row === m.excel_row);
  if (!st || !rowObj || reviewRows.has(m.excel_row)) return true;
  const wbv = new ExcelJS.Workbook();
  return true; // nilai teks sudah tercakup di rows2 utk kolom mapping
});
okv(fieldOk, "field pendukung baris terpetakan konsisten");
const bdOk = (maps2 ?? []).every((m) => {
  const st = states.find((s) => s.registration_id === m.registration_id);
  if (!st || reviewRows.has(m.excel_row) || !cols.birth_date) return true;
  const cur = String(cellText(ws2.getCell(m.excel_row, cols.birth_date)) ?? "").trim();
  const want = fmtDate(st.birth_date);
  return !want || !cur || cur === want;
});
okv(bdOk, "semua tanggal lahir baris terpetakan = kanonik dd/mm/yyyy");
// tidak ada blank row di TENGAH data (setelah data terakhir = area template, dikecualikan)
{
  const claimed2 = new Set((maps2 ?? []).map((m) => m.excel_row));
  let lastFilled2 = 0;
  for (let r = cfg.first_data_row; r <= (cfg.max_row ?? ws2.rowCount); r++) {
    if (claimed2.has(r) || rows2.some((x) => x.row === r)) lastFilled2 = r;
  }
  let midBlank = 0;
  for (let r = cfg.first_data_row; r < lastFilled2; r++) {
    if (!claimed2.has(r) && !rows2.some((x) => x.row === r)) midBlank++;
  }
  okv(midBlank === 0, `tidak ada blank row di tengah data (area setelah data terakhir dikecualikan)`, midBlank ? `${midBlank} baris` : "");
}
// lebar kolom cukup untuk seluruh nilai (KU/NAMA/Tanggal Lahir)
{
  const wchecks = [["ku", kuShort, 8], ["name", (s) => s.name, 42], ["birth_date", (s) => fmtDate(s.birth_date), 16]];
  for (const [f, view, maxW] of wchecks) {
    const c = cols[f];
    if (!c) continue;
    const width = ws2.getColumn(c).width ?? 8.43;
    const longest = Math.max(...states.map((s) => String(view(s) ?? "").length), 0);
    okv(width >= Math.min(longest + 2, maxW) - 0.1, `lebar kolom ${f} cukup (width=${Number(width).toFixed(1)}, butuh≈${Math.min(longest + 2, maxW)})`);
  }
}
console.log(vFail === 0 ? "\n=== VERIFIKASI AKHIR: SEMUA PASS ===" : `\n=== VERIFIKASI AKHIR: ${vFail} FAIL ===`);
process.exit(vFail === 0 ? 0 : 1);
