import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = envText.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : null;
};

const supabase = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
);

async function main() {
  console.log('=== TRAINING GROUPS ===');
  const { data: groups } = await supabase.from('training_groups').select('*').order('name');
  console.log(groups);

  console.log('\n=== TRAINING GROUP MEMBERS (dengan nama atlet) ===');
  const { data: members } = await supabase
    .from('training_group_members')
    .select('group_id, athlete_id, athletes(full_name, cakra)');
  console.log(members?.slice(0, 10));

  console.log('\n=== ATHLETES (sample) ===');
  const { data: athletes } = await supabase.from('athletes').select('id, full_name, cakra, group_id').limit(10);
  console.log(athletes);

  console.log('\n=== DISTRIBUSI CAKRA DI ATHLETES ===');
  const { data: allAthletes } = await supabase.from('athletes').select('cakra');
  const counts = {};
  allAthletes?.forEach(a => {
    const k = a.cakra || 'NULL';
    counts[k] = (counts[k] || 0) + 1;
  });
  console.log(counts);

  console.log('\n=== ATHLETES TANPA RELASI GROUP ===');
  const { data: noGroup } = await supabase
    .from('athletes')
    .select('id, full_name, cakra')
    .not('id', 'in', (qb) => qb.from('training_group_members').select('athlete_id'));
  console.log(`Total: ${noGroup?.length}`);
  console.log(noGroup?.slice(0, 10));

  console.log('\n=== ATHLETES DENGAN >1 GROUP ===');
  const { data: dup } = await supabase
    .from('training_group_members')
    .select('athlete_id, count(*)')
    .group('athlete_id')
    .having('count(*) > 1');
  console.log(dup);

  console.log('\n=== EVENT_PAYMENTS (sample cakra) ===');
  const { data: payments } = await supabase.from('event_payments').select('cakra').limit(5);
  console.log(payments);

  console.log('\n=== CEK KOLOM CAKRA DI ATHLETES (ada/tidak) ===');
  // coba select cakra untuk lihat error
  const { data: test } = await supabase.from('athletes').select('cakra').limit(1);
  console.log('Kolom cakra ada?', test !== null ? 'Ya' : 'Tidak');
}

main().catch(console.error);