-- 0025h: enqueue idempoten — cegah duplicate job (uq_excel_jobs_dedupe 23505).
-- Update beruntun pada registration yang sama saat job masih PENDING/RETRYING
-- tidak lagi membuat job kedua; race condition dua-trigger simultan
-- dilindungi advisory lock transaction-level.
create or replace function public.fn_excel_sync_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid;
  v_reg_id uuid;
  v_athlete uuid;
  v_action text := 'upsert_registration';
begin
  if tg_table_name = 'event_payments' then
    v_reg_id := new.registration_id;
    select r.event_id, r.athlete_id into v_event_id, v_athlete
      from public.event_registrations r where r.id = v_reg_id;
  else
    v_reg_id := new.id;
    v_event_id := new.event_id;
    v_athlete := new.athlete_id;
  end if;

  -- Aksi delete hanya dari RPC permanent-delete (soft cancel tetap upsert agar Excel ikut status)
  if tg_op = 'DELETE' then
    v_action := 'delete_registration';
    v_event_id := old.event_id;
    v_athlete := old.athlete_id;
    v_reg_id := old.id;
  end if;

  -- Satu config aktif per event → satu job per (config, registration, action).
  perform pg_advisory_xact_lock(hashtext('excel_sync_enqueue:' || coalesce(v_reg_id::text, '') || ':' || v_action));
  insert into public.excel_sync_jobs (configuration_id, registration_id, athlete_id, action)
    select c.id, v_reg_id, v_athlete, v_action
      from public.excel_sync_configurations c
     where c.event_id = v_event_id and c.enabled and
           (select enabled from public.excel_sync_settings where id='global')
    on conflict (configuration_id, coalesce(registration_id, '0f0e0d0c-0b0a-0908-0706-050403020100'::uuid), action) do nothing;
  return null;
end $$;

drop trigger if exists trg_excel_sync_reg on public.event_registrations;
create trigger trg_excel_sync_reg
after insert or update on public.event_registrations
for each row execute function public.fn_excel_sync_enqueue();

drop trigger if exists trg_excel_sync_pay on public.event_payments;
create trigger trg_excel_sync_pay
after update of payment_status, amount_paid, payment_method on public.event_payments
for each row when (old.* is distinct from new.*) execute function public.fn_excel_sync_enqueue();
