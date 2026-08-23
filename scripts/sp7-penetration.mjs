// SP7 PENETRATION TEST — uji otorisasi lintas-role lewat HTTP nyata (localhost:3100)
// Login ke Supabase per akun uji, bentuk cookie sb-<ref>-auth-token, lalu serang endpoint.
// Tidak ada kredensial yang dicetak ke output. Hasil ditulis ke sp7-penetration-results.txt
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const ref = url.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const COOKIE = `sb-${ref}-auth-token`;
const BASE = 'http://localhost:3100';

const ACCOUNTS = {
  admin:    ['admin@cakra.local', 'Admin123!'],
  operator: ['operator@cakra.local', 'Operator123!'],
  coach:    ['coach@cakra.local', 'Coach123!'],
  ketua1:   ['ketua.cakra1@cakra.local', 'Cakra123!'],
  ketua2:   ['ketua.cakra2@cakra.local', 'Cakra123!'],
  athlete:  ['athlete@cakra.local', 'Athlete123!'],
  parent:   ['parent@cakra.local', 'Parent123!'],
};

const sessions = {}; // role -> { cookieValue, sbClient }
const results = [];
function record(id, desc, expect, got, pass) {
  results.push({ id, desc, expect, got, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} | ${desc} | expect=${expect} got=${got}`);
}

async function login(role) {
  if (sessions[role]) return sessions[role];
  const [email, password] = ACCOUNTS[role];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`login ${role} gagal: ${error?.message}`);
  const cookieValue = encodeURIComponent(JSON.stringify(data.session));
  sessions[role] = { cookieValue, sb };
  return sessions[role];
}

async function http(role, method, path, body, opts = {}) {
  let headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  if (role && role !== 'anon') {
    const s = await login(role);
    headers['Cookie'] = `${COOKIE}=${s.cookieValue}`;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, redirect: 'manual' });
    const ct = res.headers.get('content-type') ?? '';
    let payload;
    if (ct.includes('json')) payload = await res.json().catch(() => null);
    else payload = `<${ct || 'no-ct'} ${ (await res.text().catch(() => '')).length } bytes>`;
    return { status: res.status, payload };
  } finally { clearTimeout(t); }
}

const UUID_A = '00000000-0000-0000-0000-000000000001';
const UUID_B = '00000000-0000-0000-0000-000000000002';

(async () => {
  // ===== A. Unauthenticated =====
  let r = await http('anon', 'GET', '/api/export?kind=athletes');
  record('A1', 'export tanpa sesi', '401', r.status, r.status === 401);

  r = await http('anon', 'POST', '/api/performance', { athlete_id: UUID_A, recorded_at: '2026-01-01', stroke: 'FREE', distance: 50, time: '30.00' });
  record('A2', 'catat performa tanpa sesi', '401', r.status, r.status === 401);

  r = await http('anon', 'GET', '/api/notifications');
  record('A3', 'notifikasi tanpa sesi', '401', r.status, r.status === 401);

  r = await http('anon', 'POST', '/api/communication/manual', { target_role: 'parent', title: 'x', message: 'y' });
  record('A4', 'broadcast tanpa sesi', '401', r.status, r.status === 401);

  // ===== C/D/E. Route gate lintas-role =====
  r = await http('coach', 'PATCH', '/api/admin/payment-settings', { registration_fee: 999999 });
  record('C1', 'coach ubah payment-settings', '403', r.status, r.status === 403);

  r = await http('ketua1', 'PATCH', '/api/admin/payment-settings', { registration_fee: 999999 });
  record('C2', 'ketua ubah payment-settings', '403', r.status, r.status === 403);

  r = await http('parent', 'PATCH', '/api/admin/payment-settings', { registration_fee: 999999 });
  record('C3', 'parent ubah payment-settings', '403', r.status, r.status === 403);

  r = await http('ketua1', 'POST', '/api/communication/manual', { target_role: 'parent', title: 'uji', message: 'uji' });
  record('D1', 'ketua broadcast manual', '403', r.status, r.status === 403);

  r = await http('athlete', 'POST', '/api/communication/manual', { target_role: 'parent', title: 'uji', message: 'uji' });
  record('D2', 'atlet broadcast manual', '403', r.status, r.status === 403);

  r = await http('coach', 'POST', '/api/communication/retry', { id: UUID_A });
  record('D3', 'coach retry delivery', '403', r.status, r.status === 403);

  r = await http('operator', 'PATCH', '/api/admin/accounts/' + UUID_B, { role: 'admin' });
  record('D4', 'operator ubah akun (admin-only)', '401|403|404', String(r.status), [401, 403, 404].includes(r.status));

  // ===== F. Ownership performa =====
  // cari athlete id milik kelompok ketua1 (via sesi ketua1)
  const s1 = await login('ketua1');
  const { data: g1athletes } = await s1.sb.from('athletes').select('id').limit(1);
  const g1id = g1athletes?.[0]?.id ?? null;

  r = await http('athlete', 'POST', '/api/performance', g1id ? { athlete_id: g1id, recorded_at: '2026-01-01', stroke: 'FREE', distance: 50, time: '29.99' } : { athlete_id: UUID_A, recorded_at: '2026-01-01', stroke: 'FREE', distance: 50, time: '29.99' });
  record('F1', 'atlet catat performa atlet lain/scope luar', '400|403|500-non-ok', `${r.status}:${JSON.stringify(r.payload).slice(0, 60)}`, r.status !== 200);

  const s2 = await login('ketua2');
  const { data: g2athletes } = await s2.sb.from('athletes').select('id').limit(1);
  const g2id = g2athletes?.[0]?.id ?? null;

  r = await http('ketua2', 'POST', '/api/performance', g2id ? { athlete_id: g2id, recorded_at: '2026-01-01', stroke: 'FREE', distance: 50, time: '29.98' } : { athlete_id: UUID_A, recorded_at: '2026-01-01', stroke: 'FREE', distance: 50, time: '29.98' });
  record('F2', 'ketua2 catat performa di luar kelompoknya', '400|403|500-non-ok', `${r.status}:${JSON.stringify(r.payload).slice(0, 60)}`, r.status !== 200);

  // ===== G/H. Notifikasi milik pribadi =====
  r = await http('parent', 'GET', '/api/notifications');
  record('G1', 'parent baca notifikasinya', '200', r.status, r.status === 200);

  // ambil satu id notifikasi milik admin (via sesi admin), coba ditandai dibaca oleh parent
  const sa = await login('admin');
  const { data: adminNotifs } = await sa.sb.from('notifications').select('id').limit(1);
  const foreignNotifId = adminNotifs?.[0]?.id ?? null;
  if (foreignNotifId) {
    r = await http('parent', 'POST', '/api/notifications/read', { id: foreignNotifId });
    record('H1', 'parent tandai-notifikasi-admin sebagai dibaca', '403', `${r.status}`, r.status === 403);
  } else {
    record('H1', 'tandai-notifikasi-admin (skip: admin tak punya notifikasi)', 'SKIP', '-', true);
  }

  // ===== I. Endpoint service =====
  r = await http('anon', 'POST', '/api/automation/sweep');
  record('I1', 'sweep tanpa CRON secret', '401|403', r.status, [401, 403].includes(r.status));

  r = await http('anon', 'GET', '/api/hermes');
  record('I2', 'hermes tanpa bearer', '401|403', r.status, [401, 403].includes(r.status));

  // ===== B. Export RLS scope =====
  r = await http('admin', 'GET', '/api/export?kind=payments');
  record('B1', 'admin export pembayaran', '200-xlsx', `${r.status}:${String(r.payload).slice(0, 20)}`, r.status === 200);

  r = await http('parent', 'GET', '/api/export?kind=payments');
  record('B2', 'parent export pembayaran (harus kosong/ditolak)', 'non-200 ATAU 200-tanpa-data', r.status, true); // dicatat utk analisis, tidak fail otomatis
  results[results.length - 1].desc += ' [INFO]';

  // ===== J. RLS langsung: isolasi antar-ketua =====
  const { count: k1count } = await s1.sb.from('athletes').select('id', { count: 'exact', head: true });
  const { count: k2count } = await s2.sb.from('athletes').select('id', { count: 'exact', head: true });
  const { data: overlap } = await s1.sb.from('athletes').select('id').limit(1000);
  const { data: overlap2 } = await s2.sb.from('athletes').select('id').limit(1000);
  const set2 = new Set((overlap2 ?? []).map(a => a.id));
  const inter = (overlap ?? []).filter(a => set2.has(a.id)).length;
  record('J1', `isolasi atlet antar-ketua (k1=${k1count}, k2=${k2count}, irisan=${inter})`, 'irisan=0', String(inter), inter === 0);

  const { count: pcount } = await (await login('parent')).sb.from('athletes').select('id', { count: 'exact', head: true });
  const { count: acount } = await sa.sb.from('athletes').select('id', { count: 'exact', head: true });
  record('J2', 'scope parent ≤ scope admin', 'p<=a', `p=${pcount},a=${acount}`, (pcount ?? 0) <= (acount ?? 0));

  // ===== Ringkasan =====
  const fails = results.filter(x => !x.pass);
  const lines = [
    `== SP7 PENETRATION RESULTS == ${new Date().toISOString()}`,
    ...results.map(x => `${x.pass ? 'PASS' : 'FAIL'} | ${x.id} | ${x.desc} | expect=${x.expect} | got=${x.got}`),
    `== TOTAL ${results.length} | FAIL ${fails.length} ==`,
  ];
  writeFileSync('sp7-penetration-results.txt', lines.join('\n'));
  console.log(lines.at(-1));
})().catch(e => { console.error('FATAL', e?.message); process.exit(1); });
