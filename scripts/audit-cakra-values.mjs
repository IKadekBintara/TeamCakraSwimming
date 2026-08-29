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
  // Ambil semua atlet dengan cakra
  const { data: athletes, error } = await supabase
    .from('athletes')
    .select('id, full_name, cakra');

  if (error) {
    console.error('Gagal ambil atlet:', error);
    return;
  }

  console.log(`Total atlet: ${athletes.length}`);

  // Hitung distribusi cakra
  const dist = {};
  let without = 0;
  athletes.forEach(a => {
    const val = a.cakra?.trim() || null;
    if (val === null || val === '') {
      without++;
    } else {
      dist[val] = (dist[val] || 0) + 1;
    }
  });

  console.log('\n=== DISTRIBUSI CAKRA ===');
  console.log('Nilai unik:', Object.keys(dist).sort());
  console.log('Jumlah per nilai:', dist);
  console.log(`Atlet tanpa cakra: ${without}`);

  // Contoh 5 atlet
  console.log('\n=== SAMPEL ATLET ===');
  athletes.slice(0, 5).forEach(a => {
    console.log(`${a.full_name} | cakra: ${a.cakra || 'NULL'}`);
  });
}

main().catch(console.error);