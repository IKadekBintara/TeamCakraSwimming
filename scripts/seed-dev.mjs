import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
const svc = createClient(url, serviceKey, { auth: { persistSession: false } });

const ACCOUNTS = [
  { email: 'admin@cakra.local', password: 'Admin123!', role: 'admin', name: 'Admin Cakra' },
  { email: 'operator@cakra.local', password: 'Operator123!', role: 'operator', name: 'Operator Cakra' },
  { email: 'coach@cakra.local', password: 'Coach123!', role: 'coach', name: 'Coach Cakra' },
  { email: 'ketua.cakra1@cakra.local', password: 'Cakra123!', role: 'group_leader', name: 'Ketua Cakra 1' },
  { email: 'ketua.cakra2@cakra.local', password: 'Cakra123!', role: 'group_leader', name: 'Ketua Cakra 2' },
  { email: 'ketua.cakra3@cakra.local', password: 'Cakra123!', role: 'group_leader', name: 'Ketua Cakra 3' },
  { email: 'athlete@cakra.local', password: 'Athlete123!', role: 'athlete', name: 'Atlet Uji' },
  { email: 'parent@cakra.local', password: 'Parent123!', role: 'parent', name: 'Orang Tua Uji' },
];

console.log('== Membuat akun test ==');
const ids = {};
for (const a of ACCOUNTS) {
  // idempotent: cari dulu
  const { data: list } = await svc.auth.admin.listUsers();
  const existing = list.users.find(u => u.email === a.email);
  let uid = existing?.id;
  if (!uid) {
    const { data, error } = await svc.auth.admin.createUser({
      email: a.email, password: a.password, email_confirm: true,
      user_metadata: { full_name: a.name },
    });
    if (error) { console.log(`✗ ${a.email}: ${error.message}`); continue; }
    uid = data.user.id;
    console.log(`✓ dibuat: ${a.email}`);
  } else {
    console.log(`• sudah ada: ${a.email}`);
  }
  ids[a.role + '|' + a.name] = uid;

  const { error: pe } = await svc.from('profiles').upsert({ id: uid, full_name: a.name, role: a.role });
  if (pe) console.log(`  profile error: ${pe.message}`);
}

// Coach record
const coachUid = ids['coach|Coach Cakra'];
let coachId;
{
  const { data } = await svc.from('coaches').select('id').eq('user_id', coachUid).maybeSingle();
  if (data) coachId = data.id;
  else {
    const { data, error } = await svc.from('coaches').insert({ user_id: coachUid, full_name: 'Coach Cakra', whatsapp: '6281200000001' }).select('id').single();
    if (error) console.log('coach error:', error.message); else coachId = data.id;
  }
}

// Parent record
const parentUid = ids['parent|Orang Tua Uji'];
let parentId;
{
  const { data } = await svc.from('parents').select('id').eq('user_id', parentUid).maybeSingle();
  if (data) parentId = data.id;
  else {
    const { data, error } = await svc.from('parents').insert({ user_id: parentUid, full_name: 'Orang Tua Uji', whatsapp: '6281200000002' }).select('id').single();
    if (error) console.log('parent error:', error.message); else parentId = data.id;
  }
}

// Groups
const GROUPS = [
  { name: 'Team Cakra 1', leader: 'ketua.cakra1@cakra.local' },
  { name: 'Team Cakra 2', leader: 'ketua.cakra2@cakra.local' },
  { name: 'Team Cakra 3', leader: 'ketua.cakra3@cakra.local' },
];
const groupIds = {};
for (const g of GROUPS) {
  const { data: existing } = await svc.from('training_groups').select('id').eq('name', g.name).maybeSingle();
  if (existing) { groupIds[g.name] = existing.id; continue; }
  const leaderUid = Object.entries(ids).find(([k]) => k.includes(g.leader.split('@')[0].replace('ketua.', 'Ketua ').replace('cakra', 'Cakra ')))?.[1];
  const payload = { name: g.name, location: 'Kolam Renang Utama', coach_id: g.name === 'Team Cakra 1' ? coachId : null, leader_id: leaderUid ?? null };
  const { data, error } = await svc.from('training_groups').insert(payload).select('id').single();
  if (error) console.log(`group ${g.name} error:`, error.message);
  else { groupIds[g.name] = data.id; console.log(`✓ grup: ${g.name}`); }
}

// Schedules
const SCHEDULES = [
  { group: 'Team Cakra 1', dow: 0, start: '07:00', end: '09:00' },
  { group: 'Team Cakra 2', dow: 3, start: '16:00', end: '18:00' },
  { group: 'Team Cakra 3', dow: 6, start: '07:00', end: '09:00' },
];
for (const s of SCHEDULES) {
  const gid = groupIds[s.group];
  if (!gid) continue;
  const { data: existing } = await svc.from('training_schedules').select('id').eq('group_id', gid).maybeSingle();
  if (existing) continue;
  const { error } = await svc.from('training_schedules').insert({ group_id: gid, day_of_week: s.dow, start_time: s.start, end_time: s.end, location: 'Kolam Renang Utama' });
  if (error) console.log(`jadwal ${s.group} error:`, error.message);
  else console.log(`✓ jadwal: ${s.group}`);
}

// Athlete uji + membership
const athleteUid = ids['athlete|Atlet Uji'];
let athleteId;
{
  const { data } = await svc.from('athletes').select('id').eq('user_id', athleteUid).maybeSingle();
  if (data) athleteId = data.id;
  else {
    const { data, error } = await svc.from('athletes').insert({ user_id: athleteUid, full_name: 'Atlet Uji', nickname: 'Uji', program: 'Athlete', parent_id: parentId, parent_name: 'Orang Tua Uji', whatsapp: '6281200000003', status: 'ACTIVE' }).select('id').single();
    if (error) console.log('athlete error:', error.message); else athleteId = data.id;
  }
}
if (athleteId && groupIds['Team Cakra 1']) {
  const { data: mem } = await svc.from('training_group_members').select('id').eq('athlete_id', athleteId).is('left_at', null).maybeSingle();
  if (!mem) {
    const { error } = await svc.from('training_group_members').insert({ group_id: groupIds['Team Cakra 1'], athlete_id: athleteId });
    if (error) console.log('member error:', error.message);
    else console.log('✓ Atlet Uji → Team Cakra 1');
  }
}

console.log('\n== Verifikasi login ==');
const anon = createClient(url, get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const { data: login, error: e3 } = await anon.auth.signInWithPassword({ email: 'admin@cakra.local', password: 'Admin123!' });
console.log(e3 ? 'GAGAL: ' + e3.message : 'BERHASIL LOGIN: ' + login.user?.email);
