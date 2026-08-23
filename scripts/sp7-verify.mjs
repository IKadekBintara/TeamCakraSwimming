// SP7 VERIFY — regresi snapshot harga (55rb→60rb) + regresi export.
// Fixture dibuat via service role, dibersihkan di akhir. Tanpa data dummy yang tertinggal.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = readFileSync('.env.local','utf8');
const get=(k)=>env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]?.trim();
const url=get('NEXT_PUBLIC_SUPABASE_URL'), anon=get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), svcKey=get('SUPABASE_SERVICE_ROLE_KEY');
const ref=url.match(/https:\/\/(.*?)\.supabase\.co/)[1];
const COOKIE=`sb-${ref}-auth-token`;
const BASE='http://localhost:3100';

const svc=createClient(url,svcKey,{auth:{persistSession:false}});
const out=[];
const log=(m)=>{out.push(m);console.log(m);};

(async()=>{
  // ==== Ambil akun uji ====
  const {data:{users}}=await svc.auth.admin.listUsers();
  const parentU=users.find(u=>u.email==='parent@cakra.local');
  const adminU=users.find(u=>u.email==='admin@cakra.local');
  if(!parentU||!adminU) throw new Error('akun uji tidak ditemukan — jalankan seed-dev.mjs');

  const {data:kid}=await svc.from('athletes').select('id').eq('parent_id',(await svc.from('parents').select('id').eq('user_id',parentU.id).single()).data.id).limit(1);
  const kidId=kid?.[0]?.id;
  if(!kidId) throw new Error('parent uji tidak punya atlet');

  // ==== Fixture event (idempoten: buang sisa run sebelumnya BESERTA child rows-nya) ====
  const {data:oldEvents}=await svc.from('events').select('id').like('name','[SP7-VERIFY]%');
  for(const ev of (oldEvents ?? [])){
    const {data:oldRegs}=await svc.from('event_registrations').select('id').eq('event_id',ev.id);
    for(const r of (oldRegs ?? [])){
      await svc.from('event_payments').delete().eq('registration_id',r.id);
      await svc.from('event_registration_entries').delete().eq('registration_id',r.id);
      await svc.from('audit_logs').delete().eq('entity','event_registrations').in('entity_id',[String(r.id)]);
    }
    await svc.from('event_registrations').delete().eq('event_id',ev.id);
    await svc.from('event_races').delete().eq('event_id',ev.id);
  }
  await svc.from('events').delete().like('name','[SP7-VERIFY]%');
  const {data:event,error:eventErr}=await svc.from('events').insert({
    name:'[SP7-VERIFY] Event Regresi Harga', event_date:'2026-12-31', location:'Kolam Uji',
    status:'OPEN', registration_deadline:'2026-12-30',
    fee_per_entry:55000, admin_fee:10000,
  }).select('id').single();
  if(eventErr||!event){log(`FATAL insert event: ${eventErr?.message}`);process.exit(1);}
  log(`fixture event: ${event.id}`);

  const {data:race,error:raceErr}=await svc.from('event_races').insert({
    event_id:event.id, name:'[SP7] Freestyle 50m', distance_m:50, stroke:'Freestyle',
    allowed_kus:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], is_relay:false, is_active:true,
    sort_order:99, price:55000, is_free:false,
  }).select('id').single();
  if(raceErr||!race){log(`FATAL insert race: ${raceErr?.message}`);process.exit(1);}

  // ==== Login parent ====
  const p=svc; // service untuk cek; parent login:
  const anonC=createClient(url,anon,{auth:{persistSession:false}});
  const {data:pl}=await anonC.auth.signInWithPassword({email:'parent@cakra.local',password:'Parent123!'});
  const parentCookie=encodeURIComponent(JSON.stringify(pl.session));

  // helper: daftar via RPC sebagai parent
  async function register(){
    const {data,error}=await anonC.rpc('create_event_registration',{
      p_event_id:event.id, p_athlete_id:kidId, p_ku:'10',
      p_race_ids:[race.id],
    });
    if(error) throw new Error('register gagal: '+error.message);
    return data;
  }
  async function paymentOf(regId){
    return (await svc.from('event_payments').select('id,total_amount').eq('registration_id',regId).single()).data;
  }

  try{
    // ===== REG-1: registrasi pertama @55rb =====
    const reg1=await register();
    const pay1=await paymentOf(reg1);
    log(`REG1 total=${pay1.total_amount} (harap 65000=55000+10000)`);
    const t1ok=Number(pay1.total_amount)===65000;

    // ===== Ubah harga race → 60rb =====
    const {error:upErr}=await svc.from('event_races').update({price:60000}).eq('id',race.id);
    if(upErr) throw upErr;
    log('harga race diubah 55000 -> 60000');

    // ===== REG-2: registrasi atlet KEDUA milik parent (yang belum terdaftar) =====
    const {data:kids2}=await svc.from('athletes').select('id').eq('parent_id',(await svc.from('parents').select('id').eq('user_id',parentU.id).single()).data.id).order('full_name');
    const otherKid=(kids2??[]).find(k=>k.id!==kidId);
    let reg2=null;
    if(otherKid){
      const {data:r2,error:e2}=await anonC.rpc('create_event_registration',{p_event_id:event.id,p_athlete_id:otherKid.id,p_ku:'10',p_race_ids:[race.id]});
      if(!e2) reg2=r2;
      else log(`REG2 note: ${e2.message}`);
    } else {
      log('REG2 skip: parent hanya punya satu atlet — pakai atlet admin');
      // fallback: atlet mana pun milik admin (staff scope)
      const {data:anyAthlete}=await svc.from('athletes').select('id').neq('id',kidId).limit(1);
      if(anyAthlete?.[0]){
        const al=await createClient(url,anon,{auth:{persistSession:false}}).auth.signInWithPassword({email:'admin@cakra.local',password:'Admin123!'});
        const adminC=createClient(url,anon,{auth:{persistSession:false}});
        await adminC.auth.setSession(al.session);
        const {data:r2b,error:e2b}=await adminC.rpc('create_event_registration',{p_event_id:event.id,p_athlete_id:anyAthlete[0].id,p_ku:'10',p_race_ids:[race.id]});
        if(!e2b) reg2=r2b; else log(`REG2 err: ${e2b.message}`);
      }
    }
    let t2ok=null, oldTotal=null;
    if(reg2){
      const pay2=await paymentOf(reg2);
      log(`REG2 total=${pay2.total_amount} (harap 70000=60000+10000)`);
      t2ok=Number(pay2.total_amount)===70000;
      const {data:p1after}=await svc.from('event_payments').select('total_amount').eq('id',pay1.id).single();
      oldTotal=p1after?.total_amount;
      log(`REG1 setelah kenaikan harga tetap=${oldTotal} (harus tetap 65000)`);
    } else {
      log('REG2 GAGAL DIBUAT — verifikasi snapshot tidak lengkap');
    }

    // ===== EXPORT regression (admin, lewat HTTP nyata + rate-limit cookie beda IP sama — hati-hati kuota 12/menit) =====
    const aLogin=await createClient(url,anon,{auth:{persistSession:false}}).auth.signInWithPassword({email:'admin@cakra.local',password:'Admin123!'});
    const adminCookie=encodeURIComponent(JSON.stringify(aLogin.data.session));
    const exps=[];
    for(const kind of ['athletes','groups','attendance','performance','event_registrations']){
      const res=await fetch(`${BASE}/api/export?kind=${kind}&from=2020-01-01&to=2100-01-01`,{headers:{Cookie:`${COOKIE}=${adminCookie}`}});
      exps.push(`${kind}=${res.status}`);
    }
    log(`EXPORT: ${exps.join(', ')}`);
    const allExpOk=exps.every(s=>s.endsWith('=200'));

    // ===== Ringkasan =====
    const pass=t1ok&&t2ok&&oldTotal==null?false:(t1ok&&(reg2?t2ok&&Number(oldTotal)===65000:false))&&allExpOk;
    log(`SNAPSHOT: REG1 ${t1ok?'PASS':'FAIL'} | REG2 ${reg2?(t2ok?'PASS':'FAIL'):'MISSING'} | OLD-TOTAL-STABLE ${reg2?(Number(oldTotal)===65000?'PASS':'FAIL'):'N/A'} | EXPORT ${allExpOk?'PASS':'FAIL'}`);

    // ===== Cleanup =====
    for(const id of [reg1,reg2].filter(Boolean)){
      await svc.from('event_payments').delete().eq('registration_id',id);
      await svc.from('event_registration_entries').delete().eq('registration_id',id);
      await svc.from('event_registrations').delete().eq('id',id);
    }
    await svc.from('audit_logs').delete().eq('entity','event_registrations').in('entity_id',[String(reg1),String(reg2)].filter(Boolean));
    await svc.from('event_races').delete().eq('id',race.id);
    await svc.from('events').delete().eq('id',event.id);
    log('cleanup fixture selesai');

    writeFileSync('sp7-verify-results.txt', out.join('\n'));
    process.exit(pass?0:2);
  }catch(e){
    // cleanup best-effort saat error
    try{ await svc.from('event_races').delete().eq('id',race.id); await svc.from('events').delete().eq('id',event.id);}catch{}
    writeFileSync('sp7-verify-results.txt', out.join('\n')+'\nFATAL: '+e.message);
    console.error('FATAL', e.message);
    process.exit(1);
  }
})();
