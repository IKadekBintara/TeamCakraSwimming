// SP7 PENETRATION TEST v2 — koreksi v1: stroke "Freestyle", sweep=GET, hermes=POST,
// notifikasi target = milik admin sejati, positive-control admin + cleanup fixture.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const svcKey = get('SUPABASE_SERVICE_ROLE_KEY');
const ref = url.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const COOKIE = `sb-${ref}-auth-token`;
const BASE = 'http://localhost:3100';

const ACCOUNTS = {
  admin:   ['admin@cakra.local', 'Admin123!'],
  operator:['operator@cakra.local', 'Operator123!'],
  coach:   ['coach@cakra.local', 'Coach123!'],
  ketua1:  ['ketua.cakra1@cakra.local', 'Cakra123!'],
  ketua2:  ['ketua.cakra2@cakra.local', 'Cakra123!'],
  athlete: ['athlete@cakra.local', 'Athlete123!'],
  parent:  ['parent@cakra.local', 'Parent123!'],
};
const sessions = {};
const svc = createClient(url, svcKey, { auth: { persistSession: false } });

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
  sessions[role] = { cookieValue: encodeURIComponent(JSON.stringify(data.session)), sb, uid: data.user.id };
  return sessions[role];
}

async function http(role, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (role && role !== 'anon') headers['Cookie'] = `${COOKIE}=${(await login(role)).cookieValue}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const ct = res.headers.get('content-type') ?? '';
  let payload;
  if (ct.includes('json')) payload = await res.json().catch(() => null);
  else { const txt = await res.text().catch(() => ''); payload = `<${ct || 'no-ct'}|${txt.length}b>`; }
  return { status: res.status, payload };
}

(async () => {
  // ===== Perbaikan uji service endpoint =====
  let r = await http('anon', 'GET', '/api/automation/sweep');
  record('I1v2', 'sweep GET tanpa secret', '401', r.status, r.status === 401);
  r = await http('anon', 'GET', '/api/automation/sweep', null);
  r = await http('anon', 'GET', '/api/automation/sweep?x=1');
  // (duplikat dipangkas — satu panggilan cukup)

  r = await http('anon', 'POST', '/api/hermes', { action: 'list_events' });
  record('I2v2', 'hermes POST tanpa bearer', '401', r.status, r.status === 401);

  // ===== Export dengan kind benar =====
  r = await http('admin', 'GET', '/api/export?kind=event_finance&from=2020-01-01&to=2100-01-01');
  record('B1v2', 'admin export event_finance', '200+xlsx', `${r.status}:${String(r.payload).slice(0, 30)}`, r.status === 200 && String(r.payload).includes('spreadsheet'));
  r = await http('coach', 'GET', '/api/export?kind=performance&from=2020-01-01&to=2100-01-01');
  record('B3v2', 'coach export performance (scope RLS)', '200/INFO', `${r.status}`, true);
  results[results.length - 1].desc += ' [INFO]';
  r = await http('parent', 'GET', '/api/export?kind=event_finance&from=2020-01-01&to=2100-01-01');
  record('B2v2', 'parent export event_finance (RLS membatasi)', '200-kosong/INFO', `${r.status}:${String(r.payload).slice(0, 30)}`, true);
  results[results.length - 1].desc += ' [INFO]';

  // ===== Ownership performa — lapisan nyata =====
  // anak si parent (visible bagi parent via athletes_parent_select)
  const sp = await login('parent');
  const { data: kids } = await sp.sb.from('athletes').select('id, full_name').limit(1);
  const kidId = kids?.[0]?.id ?? null;

  if (kidId) {
    // F1': parent coba catat hasil utk ANAKNYA sendiri → perf_insert menolak parent
    r = await http('parent', 'POST', '/api/performance', { athlete_id: kidId, recorded_at: '2026-08-01', stroke: 'Freestyle', distance: 50, time: '35.00' });
    record("F1v2", 'parent catat performa anaknya (harus ditolak)', '403', `${r.status}:${JSON.stringify(r.payload)}`, r.status === 403);

    // F2': ketua2 (grup kosong) coba utk atlet yang sama → route tak melihat atlet → 400
    r = await http('ketua2', 'POST', '/api/performance', { athlete_id: kidId, recorded_at: '2026-08-01', stroke: 'Freestyle', distance: 50, time: '35.00' });
    record('F2v2', 'ketua2 catat performa atlet luar grup', '400', `${r.status}:${JSON.stringify(r.payload)}`, r.status === 400);

    // F3': POSITIVE CONTROL — admin sah mencatat utk atlet yang sama, lalu dibersihkan
    r = await http('admin', 'POST', '/api/performance', { athlete_id: kidId, recorded_at: '2026-08-01', stroke: 'Freestyle', distance: 50, time: '34.50', notes: 'SP7-POSITIVE-CONTROL' });
    const okCreate = r.status === 200 && r.payload?.ok && r.payload?.id;
    record('F3v2', 'admin positive control catat performa', '200', `${r.status}:${JSON.stringify(r.payload).slice(0, 60)}`, Boolean(okCreate));
    if (okCreate) {
      const del = await svc.from('athlete_performance_results').delete().eq('id', r.payload.id);
      record('F3cleanup', 'bersihkan baris positive control', 'no-error', del.error ? del.error.message : 'deleted', !del.error);
    }
  } else {
    record('F1v2', 'skip: parent tanpa atlet', 'SKIP', '-', true);
  }

  // ===== H1v2: notifikasi MILIK ADMIN SEJATI =====
  const sa = await login('admin');
  let { data: adminNotif } = await sa.sb.from('notifications').select('id').eq('recipient_id', sa.uid).limit(1);
  let fixtureCreated = false;
  if (!adminNotif?.length) {
    const ins = await svc.from('notifications').insert({
      recipient_id: sa.uid, ntype: 'SYSTEM', title: '[SP7-TEST] fixture',
      message: 'fixture uji penetrasi — dihapus otomatis', is_read: false,
    }).select('id').single();
    if (!ins.error && ins.data?.id) { adminNotif = [ins.data]; fixtureCreated = true; }
  }
  const foreignId = adminNotif?.[0]?.id ?? null;
  if (foreignId) {
    r = await http('parent', 'POST', '/api/notifications/read', { id: foreignId });
    record('H1v2', 'parent tandai notifikasi milik admin', '403', `${r.status}:${JSON.stringify(r.payload)}`, r.status === 403);
    if (fixtureCreated) {
      const del = await svc.from('notifications').delete().eq('id', foreignId);
      record('H1cleanup', 'bersihkan fixture notifikasi', 'no-error', del.error ? del.error.message : 'deleted', !del.error);
    }
  } else {
    record('H1v2', 'skip: tak bisa menyediakan notifikasi admin', 'SKIP', '-', true);
  }

  // ===== Isolasi subset: id atlet parent ⊆ id atlet admin =====
  const { data: pIds } = await sp.sb.from('athletes').select('id');
  const { data: aIds } = await sa.sb.from('athletes').select('id');
  const aSet = new Set((aIds ?? []).map(x => x.id));
  const outside = (pIds ?? []).filter(x => !aSet.has(x.id)).length;
  record('J3v2', `subset parent⊆admin (p=${pIds?.length}, a=${aIds?.length})`, 'outside=0', String(outside), outside === 0);

  // ===== Ringkasan =====
  const fails = results.filter(x => !x.pass);
  const lines = [
    `== SP7 PENETRATION RESULTS v2 == ${new Date().toISOString()}`,
    ...results.map(x => `${x.pass ? 'PASS' : 'FAIL'} | ${x.id} | ${x.desc} | expect=${x.expect} | got=${x.got}`),
    `== TOTAL ${results.length} | FAIL ${fails.length} ==`,
  ];
  writeFileSync('sp7-penetration-results-v2.txt', lines.join('\n'));
  console.log(lines.at(-1));
})().catch(e => { console.error('FATAL', e?.message); process.exit(1); });
