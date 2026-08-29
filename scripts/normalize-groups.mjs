import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = envText.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1] : null;
};

const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

// 1. Handle duplikat relasi
const { data: members } = await supabase.from('training_group_members').select('*');
const counts = {};
members.forEach(m => { counts[m.athlete_id] = (counts[m.athlete_id] || 0) + 1; });
const dupAthletes = Object.keys(counts).filter(id => counts[id] > 1);
console.log('Atlet dengan >1 relasi:', dupAthletes);

for (const athleteId of dupAthletes) {
  const rels = members.filter(m => m.athlete_id === athleteId);
  let active = rels.find(r => r.left_at === null);
  if (!active) {
    active = rels.reduce((a, b) => new Date(a.joined_at) > new Date(b.joined_at) ? a : b);
  }
  const toRemove = rels.filter(r => r.id !== active.id);
  console.log(`  Atlet ${athleteId}: aktif ${active.group_id}, hapus ${toRemove.map(r => r.group_id).join(', ')}`);
  for (const r of toRemove) {
    await supabase.from('training_group_members').delete().eq('id', r.id);
  }
}

// 2. Hapus grup uji (nama mengandung 'SP11UJI')
const { data: groups } = await supabase.from('training_groups').select('*');
const testGroups = groups.filter(g => g.name.includes('SP11UJI'));
console.log('Grup uji:', testGroups.map(g => g.id));
for (const g of testGroups) {
  const { count } = await supabase.from('training_group_members').select('*', { count: 'exact', head: true }).eq('group_id', g.id);
  if (count === 0) {
    await supabase.from('training_groups').delete().eq('id', g.id);
    console.log('  Hapus grup', g.name);
  } else {
    console.log('  Lewati grup', g.name, 'masih ada', count, 'member');
  }
}

// 3. Rename grup produksi
const renameMap = {
  'Team Cakra 1': 'Cakra 1',
  'Team Cakra 2': 'Cakra 2',
  'Team Cakra 3': 'Cakra 3',
  'Team Cakra 6': 'Cakra 6',
};
for (const [oldName, newName] of Object.entries(renameMap)) {
  const g = groups.find(g => g.name === oldName);
  if (g) {
    await supabase.from('training_groups').update({ name: newName }).eq('id', g.id);
    console.log(`  Rename ${oldName} -> ${newName}`);
  }
}

// 4. Verifikasi semua atlet punya relasi
const { data: athletes } = await supabase.from('athletes').select('id');
const { data: membersAfter } = await supabase.from('training_group_members').select('athlete_id');
const memberIds = new Set(membersAfter.map(m => m.athlete_id));
const missing = athletes.filter(a => !memberIds.has(a.id));
console.log('Atlet tanpa relasi:', missing.length, missing.map(a => a.id));

console.log('Selesai.');