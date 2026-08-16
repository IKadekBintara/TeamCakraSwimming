import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');

console.log('URL:', url);
console.log('service_key_len:', serviceKey?.length, 'anon_key_len:', anonKey?.length);

const svc = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: profiles, error: e1 } = await svc.from('profiles').select('full_name, role').limit(20);
console.log('\n--- profiles ---');
if (e1) console.log('ERROR:', e1.message);
else console.log(profiles.length ? profiles : '(KOSONG — seed belum jalan)');

const { data: users, error: e2 } = await svc.auth.admin.listUsers();
console.log('\n--- auth users ---');
if (e2) console.log('ERROR:', e2.message);
else console.log(users.users.length ? users.users.map(u => u.email) : '(KOSONG — seed belum jalan)');

const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: login, error: e3 } = await anon.auth.signInWithPassword({ email: 'admin@cakra.local', password: 'Admin123!' });
console.log('\n--- test login admin@cakra.local ---');
console.log(e3 ? 'GAGAL: ' + e3.message : 'BERHASIL: ' + login.user?.email);
