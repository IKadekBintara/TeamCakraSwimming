-- TEAM CAKRA SWIMMING — event/performance/attendance/account triggers + seeds
-- (mirror of applied migrations comm_6a..comm_7)

-- ============ Event lifecycle ============
create or replace function public.on_event_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rec record; v_msg text; v_title text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status = 'OPEN' then
    v_title := 'Event dibuka';
    v_msg := new.name || ' sekarang sudah dibuka. Segera lakukan pendaftaran!';
  elsif new.status = 'CLOSED' then
    v_title := 'Event ditutup';
    v_msg := new.name || ' telah ditutup.';
  else
    return new;
  end if;
  for v_rec in select id from public.profiles where role in ('parent','athlete','coach','group_leader','ketua_kelompok') loop
    perform public.notify(v_rec.id, 'EVENT', v_title, v_msg, '/events', 'evt:' || new.status || ':' || new.id::text);
  end loop;
  return new;
end $$;

drop trigger if exists trg_event_notify on public.events;
create trigger trg_event_notify
after insert or update of status on public.events
for each row execute function public.on_event_change();

-- ============ Performance: parent ============
create or replace function public.on_perf_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ath text; v_parent_id uuid; v_parent uuid; v_pb boolean; v_prev int; v_label text;
begin
  if new.time_cs is null then return new; end if;
  select min(time_cs) into v_prev from public.athlete_performance_results
    where athlete_id = new.athlete_id and stroke = new.stroke and distance = new.distance
      and id <> new.id;
  v_pb := (v_prev is null or new.time_cs < v_prev);
  select full_name, parent_id into v_ath, v_parent_id from public.athletes where id = new.athlete_id;
  if v_parent_id is not null then
    select par.user_id into v_parent from public.parents par where par.id = v_parent_id;
  end if;
  v_label := new.stroke || ' ' || new.distance || 'm';
  if v_parent is not null then
    perform public.notify(v_parent, 'PERFORMANCE',
      case when v_pb then 'Personal Best baru tercatat' else 'Hasil performa baru dicatat' end,
      coalesce(v_ath,'Atlet') || ': ' || v_label || case when v_pb then ' - PB baru!' else '' end,
      '/notifications', 'perf:' || new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists trg_perf_notify on public.athlete_performance_results;
create trigger trg_perf_notify
after insert on public.athlete_performance_results
for each row execute function public.on_perf_insert();

-- ============ Performance: coach + ketua kelompok (scope-limited) ============
create or replace function public.on_perf_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ath text; v_pb boolean; v_prev int; v_label text; r record;
begin
  if new.time_cs is null then return new; end if;
  select min(time_cs) into v_prev from public.athlete_performance_results
    where athlete_id = new.athlete_id and stroke = new.stroke and distance = new.distance
      and id <> new.id;
  v_pb := (v_prev is null or new.time_cs < v_prev);
  select full_name into v_ath from public.athletes where id = new.athlete_id;
  v_label := new.stroke || ' ' || new.distance || 'm';
  for r in
    select distinct c.user_id
    from public.training_group_members m
    join public.training_groups tg on tg.id = m.group_id
    join public.coaches c on c.id in (tg.coach_id, tg.leader_id)
    where m.athlete_id = new.athlete_id and m.left_at is null
  loop
    perform public.notify(r.user_id, 'PERFORMANCE',
      case when v_pb then 'Personal Best baru tercatat' else 'Hasil performa baru dicatat' end,
      coalesce(v_ath,'Atlet') || ': ' || v_label || case when v_pb then ' - PB baru!' else '' end,
      '/performance', 'perfstaff:' || new.id::text || ':' || r.user_id::text);
  end loop;
  return new;
end $$;

drop trigger if exists trg_perf_staff_notify on public.athlete_performance_results;
create trigger trg_perf_staff_notify
after insert on public.athlete_performance_results
for each row execute function public.on_perf_staff();

-- ============ Attendance recorded -> parent ============
create or replace function public.on_attendance_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_parent uuid;
begin
  select par.user_id into v_parent
    from public.athletes a join public.parents par on par.id = a.parent_id
    where a.id = new.athlete_id;
  if v_parent is not null then
    perform public.notify(v_parent, 'ATTENDANCE', 'Absensi tercatat',
      'Absensi latihan hari ini untuk atlet Anda telah dicatat.',
      '/notifications', 'att:' || new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists trg_att_notify on public.attendance;
create trigger trg_att_notify
after insert on public.attendance
for each row execute function public.on_attendance_insert();

-- ============ Account created -> welcome ============
create or replace function public.on_account_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.id, 'ACCOUNT', 'Akun Anda telah dibuat',
    'Selamat datang di TEAM CAKRA SWIMMING! Akun Anda sudah aktif.',
    '/notifications', 'acct:' || new.id::text);
  return new;
end $$;

drop trigger if exists trg_acct_notify on public.profiles;
create trigger trg_acct_notify
after insert on public.profiles
for each row execute function public.on_account_created();

-- ============ Seed templates + automation settings ============
insert into public.notification_templates (key, name, channel, subject, body, variables) values
('registration_created', 'Pendaftaran berhasil', 'in_app', null, 'Pendaftaran {{athlete_name}} untuk {{event_name}} berhasil dibuat.', '["athlete_name","event_name"]'),
('payment_submitted', 'Bukti pembayaran terkirim', 'in_app', null, 'Pembayaran {{athlete_name}} untuk {{event_name}} menunggu verifikasi.', '["athlete_name","event_name","amount"]'),
('payment_verified', 'Pembayaran diverifikasi', 'in_app', null, 'Pembayaran {{athlete_name}} untuk {{event_name}} telah diverifikasi. Terima kasih!', '["athlete_name","event_name","amount"]'),
('payment_rejected', 'Pembayaran ditolak', 'in_app', null, 'Pembayaran {{athlete_name}} untuk {{event_name}} ditolak. Silakan hubungi admin.', '["athlete_name","event_name"]'),
('payment_reminder', 'Pengingat pembayaran', 'in_app', null, 'Pengingat: pembayaran pendaftaran {{event_name}} untuk {{athlete_name}} belum lunas ({{amount}}).', '["athlete_name","event_name","deadline","amount"]'),
('event_deadline', 'Pengingat deadline event', 'in_app', null, '{{event_name}} akan ditutup pada {{deadline}}.', '["event_name","deadline"]')
on conflict (key) do nothing;

insert into public.notification_templates (key, name, channel, subject, body, variables) values
('email_registration_created', 'Email: Pendaftaran berhasil', 'email', 'Pendaftaran Berhasil - TEAM CAKRA SWIMMING', '<h2>Pendaftaran Berhasil</h2><p>Halo,</p><p>Pendaftaran <strong>{{athlete_name}}</strong> untuk event <strong>{{event_name}}</strong> telah berhasil dibuat.</p><p>Total: <strong>{{amount}}</strong></p>', '["athlete_name","event_name","amount"]'),
('email_payment_reminder', 'Email: Pengingat pembayaran', 'email', 'Pengingat Pembayaran - TEAM CAKRA SWIMMING', '<h2>Pengingat Pembayaran</h2><p>Pembayaran pendaftaran <strong>{{event_name}}</strong> untuk <strong>{{athlete_name}}</strong> belum lunas.</p><p>Jumlah: <strong>{{amount}}</strong></p>', '["athlete_name","event_name","amount","deadline"]')
on conflict (key) do nothing;

insert into public.notification_templates (key, name, channel, subject, body, variables) values
('wa_payment_reminder', 'WA: Pengingat pembayaran', 'whatsapp', null, 'Pengingat pembayaran pendaftaran {{event_name}} untuk {{athlete_name}}.', '["athlete_name","event_name"]')
on conflict (key) do nothing;

insert into public.automation_settings (id, enabled, offsets_hours) values
('payment_reminder', false, '{24,48}'),
('event_deadline_reminder', false, array[168,72,24])
on conflict (id) do nothing;
