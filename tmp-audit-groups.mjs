import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envText = fs.readFileSync('.env.local', 'utf8');
const get = (k) => { const m = envText.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null; };
const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'));

async function main() {
  console.log('=== TRAINING GROUPS ===');
  const { data: groups } = await supabase.from('training_groups').select('*').order('name');
  console.log(groups);

  console.log('\n=== TRAINING GROUP MEMBERS (dengan nama atlet) ===');
  const { data: members } = await supabase
    .from('training_group_members')
    .select('group_id, athlete_id, athletes(full_name)');
  console.log(members?.slice(0, 10));

  console.log('\n=== ATHLETES: kolom cakra & group_id ===');
  const { data: athletes } = await supabase.from('athletes').select('id, full_name, cakra, group_id').limit(5);
  console.log(athletes);

  console.log('\n=== ATHLETES DENGAN >1 KELOMPOK ===');
  const { data: dup } = await supabase
    .from('training_group_members')
    .select('athlete_id, count(*)')
    .group('athlete_id')
    .having('count(*) > 1');
  console.log(dup);

  console.log('\n=== ATHLETES TANPA KELOMPOK ===');
  const { data: noGroup } = await supabase
    .from('athletes')
    .select('id, full_name')
    .not('id', 'in', (qb) => qb.from('training_group_members').select('athlete_id'));
  console.log(noGroup?.length, noGroup?.slice(0, 5));

  // cek event_registrations apakah ada kolom group_id/cakra
  const { data: regSample } = await supabase.from('event_registrations').select('*').limit(1);
  if (regSample?.length) console.log('\n=== EVENT_REGISTRATIONS columns ===', Object.keys(regSample[0]));
}
main().catch(console.error);