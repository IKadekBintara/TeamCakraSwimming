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

// Mapping dari nilai cakra lama ke group_id yang sesuai
const MAPPING = {
  'Cakra Atlet': '59ac06b5-c7a0-4680-9de2-50eb2a80e5aa',
  'Cakra 1': 'd7054eef-d331-4c8f-b8df-1a46c7d13b2c',
  // tambahkan mapping lain jika diperlukan
};

async function main() {
  console.log('=== MIGRASI CAKRA KE TRAINING_GROUP_MEMBERS ===');

  // 1. Ambil semua atlet
  const { data: athletes, error: errAth } = await supabase
    .from('athletes')
    .select('id, full_name, cakra');
  if (errAth) throw errAth;
  console.log(`Total atlet: ${athletes.length}`);

  // 2. Ambil semua relasi yang sudah ada
  const { data: existing, error: errExist } = await supabase
    .from('training_group_members')
    .select('athlete_id, group_id');
  if (errExist) throw errExist;
  const existingSet = new Set(existing.map(e => `${e.athlete_id}|${e.group_id}`));

  // 3. Untuk setiap atlet, tentukan group_id berdasarkan cakra
  let added = 0;
  let skipped = 0;
  for (const a of athletes) {
    const cakra = a.cakra?.trim();
    if (!cakra) {
      // Tidak ada cakra -> tidak dimasukkan
      skipped++;
      continue;
    }
    const groupId = MAPPING[cakra];
    if (!groupId) {
      console.warn(`Tidak ada mapping untuk cakra: "${cakra}" pada atlet ${a.full_name} (${a.id})`);
      continue;
    }
    // Cek apakah relasi sudah ada
    const key = `${a.id}|${groupId}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }
    // Tambahkan relasi
    const { error: insertErr } = await supabase
      .from('training_group_members')
      .insert({ athlete_id: a.id, group_id: groupId });
    if (insertErr) {
      console.error(`Gagal menambah relasi untuk ${a.full_name}:`, insertErr);
    } else {
      added++;
      console.log(`+ ${a.full_name} → ${cakra} (group_id ${groupId})`);
    }
  }

  console.log(`\nSelesai: ditambahkan ${added} relasi, dilewati ${skipped} (sudah ada atau tanpa cakra)`);

  // 4. Verifikasi: hitung jumlah relasi sekarang
  const { data: after, error: errAfter } = await supabase
    .from('training_group_members')
    .select('athlete_id', { count: 'exact' });
  if (errAfter) throw errAfter;
  console.log(`Total relasi setelah migrasi: ${after.length}`);
}

main().catch(console.error);