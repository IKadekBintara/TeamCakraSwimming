-- 20260830110000_excel_sync_delete_trigger.sql
-- =====================================================================
-- EXCEL SYNC: enqueue job `delete_registration` saat registration DI-DELETE.
-- ROOT CAUSE yang diperbaiki:
--   Trigger fn_excel_sync_enqueue sejak 0025 hanya `AFTER INSERT OR UPDATE`.
--   Jalur hapus permanen satu pendaftaran ("Hilangkan dari Event",
--   event-payments PATCH remove_from_event) memakai service.delete() —
--   tanpa trigger → baris Excel + mapping YATIM (orphan). Ketika atlet
--   daftar ulang, upsert nama-match ke baris yatim berisi KU lama →
--   false DATA_MISMATCH (kasus nyata: ku @r54 excel="2021-Keatas" db="III").
-- DESAIN:
--   * Payload SNAPSHOT untuk delete (provenance); jalur insert/update
--     mengirim payload '{}' karena kolom jobs.payload NOT NULL.
--   * Aman dipanggil beruntun: dedupe partial unique index uq_excel_jobs_dedupe.
--   * Idempoten: re-run aman; tidak mengubah data registration.
-- =====================================================================

create or replace function public.fn_excel_sync_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid;
  v_reg_id uuid;
  v_athlete uuid;
  v_action text := 'upsert_registration';
  v_payload jsonb := '{}'::jsonb;
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

  -- DELETE registration → job pembersihan baris Excel (snapshot utk provenance).
  if tg_op = 'DELETE' then
    v_action := 'delete_registration';
    v_event_id := old.event_id;
    v_athlete := old.athlete_id;
    v_reg_id := old.id;
    v_payload := jsonb_build_object(
      'snapshot', jsonb_build_object(
        'reason', 'REGISTRATION_DELETED',
        'athlete_id', old.athlete_id,
        'event_id', old.event_id,
        'ku', old.ku,
        'status', old.status));
  end if;

  -- Satu config aktif per event → satu job aktif per (config, registration, action).
  perform pg_advisory_xact_lock(hashtext('excel_sync_enqueue:' || coalesce(v_reg_id::text, '') || ':' || v_action));
  insert into public.excel_sync_jobs (configuration_id, registration_id, athlete_id, action, payload)
    select c.id, v_reg_id, v_athlete, v_action, v_payload
      from public.excel_sync_configurations c
     where c.event_id = v_event_id and c.enabled and
           (select enabled from public.excel_sync_settings where id='global')
    on conflict (configuration_id, coalesce(registration_id, '00000000-0000-0000-0000-000000000000'::uuid), action)
         where status in ('PENDING','RETRYING')
    do nothing;
  return null;
end $$;

-- Trigger registration kini juga menangani DELETE (inti perbaikan).
drop trigger if exists trg_excel_sync_reg on public.event_registrations;
create trigger trg_excel_sync_reg
after insert or update or delete on public.event_registrations
for each row execute function public.fn_excel_sync_enqueue();

-- Trigger pembayaran tidak berubah (tetap update-only) — didefinisikan ulang
-- agar state konsisten bila migrasi lama belum terpasang utuh.
drop trigger if exists trg_excel_sync_pay on public.event_payments;
create trigger trg_excel_sync_pay
after update of payment_status, amount_paid, payment_method on public.event_payments
for each row when (old.* is distinct from new.*) execute function public.fn_excel_sync_enqueue();
