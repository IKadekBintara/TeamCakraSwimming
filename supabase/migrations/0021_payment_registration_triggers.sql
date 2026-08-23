-- TEAM CAKRA SWIMMING — payment + registration notification triggers
-- (mirror of applied migration comm_5)

-- ============ Payment lifecycle ============
create or replace function public.on_payment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pay record; v_ev text; v_parent uuid; v_adm uuid;
begin
  v_pay := coalesce(new, old);
  if v_pay.payment_status = 'CANCELLED' then return coalesce(new, old); end if;
  select e.name into v_ev from public.events e where e.id = v_pay.event_id;
  select par.user_id into v_parent
    from public.athletes a join public.parents par on par.id = a.parent_id
    where a.id = v_pay.athlete_id;

  if tg_op = 'INSERT' and v_pay.payment_status = 'MENUNGGU_VERIFIKASI' then
    foreach v_adm in array array(select id from public.profiles where role in ('admin','operator')) loop
      perform public.notify(v_adm, 'PAYMENT', 'Pembayaran menunggu verifikasi',
        'Pembayaran ' || coalesce(v_pay.athlete_name,'atlet') || ' untuk ' || coalesce(v_ev,'event') || ' menunggu verifikasi.',
        '/keuangan', 'paysub:' || v_pay.id::text);
    end loop;
    if v_parent is not null then
      perform public.notify(v_parent, 'PAYMENT', 'Bukti pembayaran terkirim',
        'Bukti pembayaran untuk ' || coalesce(v_ev,'event') || ' terkirim dan menunggu verifikasi admin.',
        '/notifications', 'paysubp:' || v_pay.id::text);
    end if;
  elsif tg_op = 'UPDATE' and old.payment_status is distinct from new.payment_status then
    if new.payment_status = 'MENUNGGU_VERIFIKASI' then
      foreach v_adm in array array(select id from public.profiles where role in ('admin','operator')) loop
        perform public.notify(v_adm, 'PAYMENT', 'Pembayaran menunggu verifikasi',
          'Pembayaran ' || coalesce(v_pay.athlete_name,'atlet') || ' untuk ' || coalesce(v_ev,'event') || ' menunggu verifikasi.',
          '/keuangan', 'paysub:' || v_pay.id::text);
      end loop;
    elsif new.payment_status = 'LUNAS' then
      if v_parent is not null then
        perform public.notify(v_parent, 'PAYMENT', 'Pembayaran diverifikasi',
          'Pembayaran ' || coalesce(v_pay.athlete_name,'atlet') || ' untuk ' || coalesce(v_ev,'event') || ' telah diverifikasi. Terima kasih!',
          '/registrations', 'payver:' || v_pay.id::text);
      end if;
    elsif new.payment_status = 'DITOLAK' then
      if v_parent is not null then
        perform public.notify(v_parent, 'PAYMENT', 'Pembayaran ditolak',
          'Pembayaran ' || coalesce(v_pay.athlete_name,'atlet') || ' untuk ' || coalesce(v_ev,'event') || ' ditolak. Silakan hubungi admin.',
          '/registrations', 'payrej:' || v_pay.id::text);
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_payment_notify on public.event_payments;
create trigger trg_payment_notify
after insert or update of payment_status on public.event_payments
for each row execute function public.on_payment_change();

-- ============ Registration created (parent + group leader) ============
create or replace function public.on_registration_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ath text; v_ev text; v_parent_id uuid; v_parent uuid; v_gl uuid; v_evid uuid;
begin
  select a.full_name, a.parent_id, r.event_id into v_ath, v_parent_id, v_evid
    from public.event_registrations r join public.athletes a on a.id = r.athlete_id
    where r.id = new.id;
  select par.user_id into v_parent from public.parents par where par.id = v_parent_id;
  select e.name into v_ev from public.events e where e.id = v_evid;
  if v_parent is not null then
    perform public.notify(v_parent, 'REGISTRATION', 'Pendaftaran berhasil',
      'Pendaftaran ' || coalesce(v_ath,'atlet') || ' untuk ' || coalesce(v_ev,'event') || ' berhasil dibuat.',
      '/registrations', 'regc:' || new.id::text);
  end if;
  select c.user_id into v_gl
    from public.training_group_members m
    join public.training_groups tg on tg.id = m.group_id
    join public.coaches c on c.id = tg.leader_id
    where m.athlete_id = new.athlete_id and m.left_at is null
    limit 1;
  if v_gl is not null then
    perform public.notify(v_gl, 'REGISTRATION', 'Pendaftaran anggota kelompok',
      'Atlet ' || coalesce(v_ath,'atlet') || ' mendaftar ' || coalesce(v_ev,'event') || '.',
      '/registrations', 'reggl:' || new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists trg_registration_notify on public.event_registrations;
create trigger trg_registration_notify
after insert on public.event_registrations
for each row execute function public.on_registration_created();
