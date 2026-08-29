-- FASE 1b: Registrasi CANCELLED tidak lagi menghalangi pendaftaran ulang.
-- 1) RPC create_event_registration: dup-check hanya terhadap status AKTIF (REGISTERED).
-- 2) Constraint unik ketat UNIQUE(event_id, athlete_id) diganti partial index
--    WHERE status='REGISTERED' + guard trigger sebagai jaring pengaman.
-- 3) Idempotent: re-run aman; tidak ada data dihapus; audit CANCELLED = UPDATE status.

CREATE OR REPLACE FUNCTION public.create_event_registration(p_event_id uuid, p_athlete_id uuid, p_ku text, p_ku_override text DEFAULT NULL::text, p_race_ids uuid[] DEFAULT '{}'::uuid[], p_amount_paid numeric DEFAULT 0, p_payment_method text DEFAULT NULL::text, p_payment_status text DEFAULT 'BELUM_BAYAR'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration_id uuid;
  v_event public.events%rowtype;
  v_race_count integer;
  v_requested_count integer;
  v_amount numeric := greatest(coalesce(p_amount_paid, 0), 0);
  v_status text := coalesce(p_payment_status, 'BELUM_BAYAR');
  v_birth_date text;
  v_birth_year integer;
  v_effective_ku text;
  v_ku_count integer;
  v_cfg public.event_ku_configurations%rowtype;
  v_athlete_status public.athlete_status;
begin
  if auth.uid() is null then
    raise exception 'Sesi login diperlukan';
  end if;

  select a.status into v_athlete_status from public.athletes a where a.id = p_athlete_id;
  if v_athlete_status is null then
    raise exception 'Atlet tidak ditemukan';
  end if;
  if v_athlete_status <> 'ACTIVE' then
    raise exception 'Atlet berstatus % tidak dapat mendaftar event baru', v_athlete_status;
  end if;

  if not (
    public.is_staff()
    or p_athlete_id in (select public.parent_athlete_ids())
    or p_athlete_id = public.my_athlete_id()
  ) then
    raise exception 'Tidak memiliki akses mendaftarkan atlet ini';
  end if;

  if coalesce(p_ku, '') = '' then
    raise exception 'KU wajib diisi';
  end if;
  if coalesce(array_length(p_race_ids, 1), 0) = 0 then
    raise exception 'Minimal satu nomor lomba wajib dipilih';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event tidak ditemukan'; end if;
  if v_event.status <> 'OPEN' then raise exception 'Event belum berstatus OPEN'; end if;
  if v_event.registration_deadline is not null and current_date > v_event.registration_deadline then
    raise exception 'Deadline pendaftaran event sudah lewat';
  end if;

  select count(distinct id), count(*) into v_race_count, v_requested_count
  from public.event_races
  where event_id = p_event_id and is_active and id = any(p_race_ids);
  if v_race_count <> v_requested_count or v_race_count <> coalesce(array_length(p_race_ids, 1), 0) then
    raise exception 'Nomor lomba tidak valid untuk event ini';
  end if;

  v_effective_ku := coalesce(nullif(p_ku_override, ''), p_ku);
  select count(*) into v_ku_count from public.event_ku_configurations where event_id = p_event_id;
  if v_ku_count > 0 then
    select a.birth_date into v_birth_date from public.athletes a where a.id = p_athlete_id;
    v_birth_year := case when v_birth_date ~ '^\d{4}' then substring(v_birth_date from 1 for 4)::integer else null end;
    select * into v_cfg from public.event_ku_configurations
      where event_id = p_event_id and enabled and ku_label = v_effective_ku
      order by sort_order limit 1;
    if not found then
      raise exception 'KU "%" tidak tersedia untuk event ini', v_effective_ku;
    end if;
    if coalesce(nullif(p_ku_override, ''), '') = '' then
      if (v_cfg.birth_year_start is not null and (v_birth_year is null or v_birth_year < v_cfg.birth_year_start))
        or (v_cfg.birth_year_end is not null and (v_birth_year is null or v_birth_year > v_cfg.birth_year_end)) then
        raise exception 'Tahun lahir atlet tidak masuk rentang KU "%"', v_cfg.ku_label;
      end if;
    end if;
    if coalesce(array_length(v_cfg.allowed_races, 1), 0) > 0 then
      if exists (select 1 from unnest(p_race_ids) as r(id) where not r.id = any (v_cfg.allowed_races)) then
        raise exception 'Ada nomor lomba di luar daftar KU "%"', v_cfg.ku_label;
      end if;
    end if;
  end if;

  if not public.is_staff() then
    if coalesce(p_payment_status, 'BELUM_BAYAR') <> 'BELUM_BAYAR' or greatest(coalesce(p_amount_paid, 0), 0) <> 0 then
      raise exception 'Hanya admin dapat mencatat pembayaran';
    end if;
    v_status := 'BELUM_BAYAR';
    v_amount := 0;
  elsif v_status not in ('BELUM_BAYAR', 'DP', 'LUNAS') then
    raise exception 'Status pembayaran admin tidak valid';
  end if;
  if v_amount < 0 then raise exception 'Nominal dibayar tidak valid'; end if;

  -- dup-check hanya status AKTIF; CANCELLED tidak menghalangi pendaftaran ulang
  if exists (
    select 1 from public.event_registrations r
    where r.event_id = p_event_id
      and r.athlete_id = p_athlete_id
      and r.status = 'REGISTERED'
  ) then
    raise exception 'Atlet masih terdaftar aktif pada event ini';
  end if;

  insert into public.event_registrations(event_id, athlete_id, ku, ku_override, registered_by)
  values (p_event_id, p_athlete_id, p_ku, nullif(p_ku_override, ''), auth.uid())
  returning id into v_registration_id;

  insert into public.event_registration_entries(registration_id, race_id)
  select v_registration_id, r.id
  from public.event_races r
  where r.id = any(p_race_ids)
  order by array_position(p_race_ids, r.id);

  insert into public.event_payments(
    athlete_id, event_id, registration_id, athlete_name, cakra, jumlah_nomor,
    registration_fee, admin_fee, total_amount, amount_paid, remaining_amount,
    payment_status, payment_method, payment_destination, submitted_by,
    submitted_at, verified_by, verified_at
  )
  select a.id, p_event_id, v_registration_id, a.full_name, a.cakra,
    (select count(*) from public.event_registration_entries where registration_id = v_registration_id),
    0, 0, 0, v_amount, 0, v_status, nullif(p_payment_method, ''),
    case when public.is_staff() and v_amount > 0 then 'Admin' else null end,
    auth.uid(), case when v_amount > 0 then now() else null end,
    case when public.is_staff() and v_amount > 0 then auth.uid() else null end,
    case when public.is_staff() and v_amount > 0 then now() else null end
  from public.athletes a where a.id = p_athlete_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, new_value)
  values (auth.uid(), 'CREATE_EVENT_REGISTRATION', 'event_registrations', v_registration_id,
    jsonb_build_object('event_id', p_event_id, 'athlete_id', p_athlete_id, 'race_ids', p_race_ids,
      'ku', v_effective_ku, 'payment_status', v_status));
  return v_registration_id;
exception
  when check_violation then
    raise exception 'Atlet masih terdaftar aktif pada event ini';
  when unique_violation then
  raise exception 'Atlet masih terdaftar aktif pada event ini';
end;
$function$;

-- (2) Ganti constraint unik ketat -> partial unique index (hanya baris AKTIF yang unik)
alter table public.event_registrations
  drop constraint if exists event_registrations_event_id_athlete_id_key;

drop index if exists public.event_registrations_event_id_athlete_id_key;

drop index if exists public.event_registrations_event_athlete_active_uniq;
create unique index event_registrations_event_athlete_active_uniq
  on public.event_registrations (event_id, athlete_id)
  where status = 'REGISTERED';

-- (2b) Guard trigger: aturan sama berlaku untuk write path mana pun.
create or replace function public.fn_registration_active_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'REGISTERED' and exists (
    select 1 from public.event_registrations r
    where r.event_id = new.event_id
      and r.athlete_id = new.athlete_id
      and r.status = 'REGISTERED'
      and r.id <> new.id
  ) then
    raise exception 'Atlet masih terdaftar aktif pada event ini';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_registration_unique on public.event_registrations;
create trigger guard_registration_unique
  before insert or update of status, event_id, athlete_id
  on public.event_registrations
  for each row execute function public.fn_registration_active_guard();

-- (3) Konsistensi: registrasi batal -> pembayaran ikut CANCELLED (UPDATE status, bukan DELETE).
update public.event_payments p
set payment_status = 'CANCELLED', updated_at = now()
from public.event_registrations r
where p.registration_id = r.id
  and r.status = 'CANCELLED'
  and p.payment_status <> 'CANCELLED';
