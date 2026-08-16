-- ============================================================
-- Development seed: akun test + grup contoh (idempotent)
-- HANYA untuk development lokal. JANGAN pakai kredensial ini di produksi.
-- Jalankan di Supabase SQL Editor setelah 0001_initial_schema.sql
-- ============================================================

-- Helper: buat auth user bila belum ada (email unik)
create or replace function public.seed_user(p_username text, p_password text, p_role app_role, p_full_name text)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions
as $$
declare
  v_email text := p_username || '@cakra.local';
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email limit 1;
  if v_id is null then
    v_id := uuid_generate_v4();
    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      'authenticated', 'authenticated',
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', p_full_name),
      now(), now()
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uuid_generate_v4(), v_id, v_email, jsonb_build_object('sub', v_id::text, 'email', v_email), 'email', now(), now(), now());
  end if;

  insert into public.profiles (id, full_name, role)
  values (v_id, p_full_name, p_role)
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

  return v_id;
end;
$$;

do $$
declare
  v_admin uuid := public.seed_user('admin', 'Admin123!', 'admin', 'Admin Cakra');
  v_operator uuid := public.seed_user('operator', 'Operator123!', 'operator', 'Operator Cakra');
  v_coach uuid := public.seed_user('coach', 'Coach123!', 'coach', 'Coach Cakra');
  v_k1 uuid := public.seed_user('ketua.cakra1', 'Cakra123!', 'group_leader', 'Ketua Cakra 1');
  v_k2 uuid := public.seed_user('ketua.cakra2', 'Cakra123!', 'group_leader', 'Ketua Cakra 2');
  v_k3 uuid := public.seed_user('ketua.cakra3', 'Cakra123!', 'group_leader', 'Ketua Cakra 3');
  v_athlete uuid := public.seed_user('athlete', 'Athlete123!', 'athlete', 'Atlet Uji');
  v_parent uuid := public.seed_user('parent', 'Parent123!', 'parent', 'Orang Tua Uji');
  v_coach_id uuid;
  v_parent_id uuid;
  v_athlete_id uuid;
  v_g1 uuid; v_g2 uuid; v_g3 uuid;
begin
  -- Coach record
  insert into public.coaches (user_id, full_name, whatsapp)
  values (v_coach, 'Coach Cakra', '6281200000001')
  on conflict do nothing;
  select id into v_coach_id from public.coaches where user_id = v_coach limit 1;

  -- Parent record
  insert into public.parents (user_id, full_name, whatsapp)
  values (v_parent, 'Orang Tua Uji', '6281200000002')
  on conflict do nothing;
  select id into v_parent_id from public.parents where user_id = v_parent limit 1;

  -- Grup contoh (dinamis — bisa tambah lewat dashboard)
  insert into public.training_groups (name, location, coach_id, leader_id)
  values ('Team Cakra 1', 'Kolam Renang Utama', v_coach_id, v_k1)
  on conflict do nothing;
  insert into public.training_groups (name, location, leader_id)
  values ('Team Cakra 2', 'Kolam Renang Utama', v_k2)
  on conflict do nothing;
  insert into public.training_groups (name, location, leader_id)
  values ('Team Cakra 3', 'Kolam Renang Utama', v_k3)
  on conflict do nothing;

  select id into v_g1 from public.training_groups where name = 'Team Cakra 1' limit 1;
  select id into v_g2 from public.training_groups where name = 'Team Cakra 2' limit 1;
  select id into v_g3 from public.training_groups where name = 'Team Cakra 3' limit 1;

  -- Jadwal contoh
  if not exists (select 1 from public.training_schedules where group_id = v_g1) then
    insert into public.training_schedules (group_id, day_of_week, start_time, end_time, location)
    values (v_g1, 0, '07:00', '09:00', 'Kolam Renang Utama'); -- Minggu
  end if;
  if not exists (select 1 from public.training_schedules where group_id = v_g2) then
    insert into public.training_schedules (group_id, day_of_week, start_time, end_time, location)
    values (v_g2, 3, '16:00', '18:00', 'Kolam Renang Utama'); -- Rabu
  end if;
  if not exists (select 1 from public.training_schedules where group_id = v_g3) then
    insert into public.training_schedules (group_id, day_of_week, start_time, end_time, location)
    values (v_g3, 6, '07:00', '09:00', 'Kolam Renang Utama'); -- Sabtu
  end if;

  -- Atlet uji (terhubung ke akun athlete + parent)
  insert into public.athletes (user_id, full_name, nickname, program, parent_id, parent_name, whatsapp, status)
  values (v_athlete, 'Atlet Uji', 'Uji', 'Athlete', v_parent_id, 'Orang Tua Uji', '6281200000003', 'ACTIVE')
  on conflict do nothing;
  select id into v_athlete_id from public.athletes where user_id = v_athlete limit 1;

  -- Keanggotaan: atlet uji → Team Cakra 1
  if v_athlete_id is not null and v_g1 is not null
     and not exists (select 1 from public.training_group_members where athlete_id = v_athlete_id and left_at is null) then
    insert into public.training_group_members (group_id, athlete_id) values (v_g1, v_athlete_id);
  end if;
end $$;

drop function public.seed_user(text, text, app_role, text);
