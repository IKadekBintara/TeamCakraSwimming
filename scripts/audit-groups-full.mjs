import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = envText.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : null;
};

const supabase = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY') || get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
);

async function main() {
  // 1. Cek apakah kolom cakra ada di athletes
  console.log('=== CEK KOLOM CAKRA DI ATHLETES ===');
  const { data: testCol, error: errCol } = await supabase
    .from('athletes')
    .select('cakra')
    .limit(1);
  if (errCol) {
    console.error('Error select cakra:', errCol);
  } else {
    console.log('Kolom cakra ada, sample:', testCol);
  }

  // 2. Ambil semua atlet dengan cakra
  const { data: athletes, error } = await supabase
    .from('athletes')
    .select('id, full_name, cakra');
  if (error) {
    console.error('Gagal ambil atlet:', error);
    return;
  }
  console.log(`Total atlet: ${athletes.length}`);

  // Distribusi cakra
  const dist = {};
  let tanpa = 0;
  athletes.forEach(a => {
    const v = a.cakra?.trim() || null;
    if (!v) tanpa++;
    else dist[v] = (dist[v] || 0) + 1;
  });
  console.log('\n=== DISTRIBUSI CAKRA ===');
  console.log('Nilai unik:', Object.keys(dist).sort());
  console.log('Jumlah:', dist);
  console.log(`Atlet tanpa cakra: ${tanpa}`);

  // 3. Cek training_groups & training_group_members
  const { data: groups } = await supabase.from('training_groups').select('*');
  console.log(`\n=== TRAINING GROUPS (${groups?.length || 0}) ===`);
  console.log(groups?.slice(0, 10));

  const { data: members } = await supabase
    .from('training_group_members')
    .select('group_id, athlete_id, athletes(full_name)')
    .limit(20);
  console.log(`\n=== TRAINING GROUP MEMBERS (${members?.length || 0}) ===`);
  console.log(members?.slice(0, 10));

  // 4. Cek event_payments: apakah ada kolom cakra?
  const { data: paySample } = await supabase
    .from('event_payments')
    .select('cakra')
    .limit(3);
  console.log('\n=== EVENT_PAYMENTS sample cakra ===', paySample);

  // 5. Cek apakah ada atlet dengan >1 kelompok aktif (jika relasi ada)
  if (members && members.length) {
    const counts = {};
    members.forEach(m => {
      counts[m.athlete_id] = (counts[m.athlete_id] || 0) + 1;
    });
    const dup = Object.entries(counts).filter(([_, c]) => c > 1);
    console.log(`\nAtlet dengan >1 kelompok: ${dup.length}`, dup.slice(0, 5));
  }
}

main().catch(console.error);