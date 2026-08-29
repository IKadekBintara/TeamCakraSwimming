import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = envText.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1] : null;
};

const supabaseUrl = get('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY');

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 1. Cek semua training_groups
async function auditGroups() {
  const { data: groups, error: gErr } = await supabase
    .from('training_groups')
    .select('*');
  if (gErr) {
    console.error('Gagal ambil training_groups:', gErr);
    return;
  }
  console.log(`Total training_groups: ${groups?.length || 0}`);
  console.log('Groups:', groups?.map(g => ({ id: g.id, name: g.name, created_at: g.created_at })));

  // 2. Cek training_group_members
  const { data: members, error: mErr } = await supabase
    .from('training_group_members')
    .select('*');
  if (mErr) {
    console.error('Gagal ambil training_group_members:', mErr);
    return;
  }
  console.log(`Total training_group_members: ${members?.length || 0}`);
  console.log('Members sample (first 5):', members?.slice(0, 5));

  // 3. Cek athletes, kolom cakra
  const { data: athletes, error: aErr } = await supabase
    .from('athletes')
    .select('id, full_name, cakra');
  if (aErr) {
    console.error('Gagal ambil athletes:', aErr);
    return;
  }
  console.log(`Total athletes: ${athletes?.length || 0}`);
  const cakraMap = {};
  let nullCakra = 0;
  athletes?.forEach(a => {
    const val = a.cakra || null;
    if (val === null) nullCakra++;
    else cakraMap[val] = (cakraMap[val] || 0) + 1;
  });
  console.log('Distribusi cakra:', cakraMap);
  console.log('Atlet tanpa cakra:', nullCakra);

  // 4. Cek apakah ada atlet dengan lebih dari satu relasi group
  const { data: multi, error: multiErr } = await supabase
    .from('training_group_members')
    .select('athlete_id, count')
    .eq('count', 1);
  // Tidak bisa pakai count di select, kita lakukan secara manual
  const { data: allMembers, error: allErr } = await supabase
    .from('training_group_members')
    .select('athlete_id, group_id');
  if (!allErr) {
    const counts = {};
    allMembers?.forEach(m => {
      counts[m.athlete_id] = (counts[m.athlete_id] || 0) + 1;
    });
    const duplicates = Object.entries(counts).filter(([_, c]) => c > 1);
    console.log(`Atlet dengan >1 grup: ${duplicates.length}`, duplicates);
  }
}

auditGroups();