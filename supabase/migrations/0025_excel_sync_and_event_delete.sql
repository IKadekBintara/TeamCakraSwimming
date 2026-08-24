-- ============================================================
-- 0025 — UNIVERSAL EXCEL SYNC + PERMANENT EVENT DELETE
-- Supabase = source of truth; Excel = optional destination.
-- Semua tabel excel_sync: RLS deny-all (akses hanya service role worker/API).
-- ============================================================

-- 1) Pengaturan global sync (singleton row id='global')
create table if not exists public.excel_sync_settings (
  id text primary key default 'global' check (id = 'global'),
  enabled boolean not null default false,
  worker_heartbeat timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.excel_sync_settings (id, enabled) values ('global', false)
on conflict (id) do nothing;

-- 2) Konfigurasi per event → file Excel
create table if not exists public.excel_sync_configurations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  file_path text not null,
  worksheet_name text not null default 'Sheet1',
  header_row int not null default 21 check (header_row >= 1),
  first_data_row int not null default 22 check (first_data_row >= 2),
  max_row int,                              -- batas area tulis (jangan lewati blok ttd)
  mapping jsonb not null default '{}'::jsonb,
  duplicate_strategy text not null default 'skip'
    check (duplicate_strategy in ('skip','update_empty_fields')),
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, file_path, worksheet_name)
);

-- 3) Queue/outbox job — diisi otomatis oleh trigger DB
create table if not exists public.excel_sync_jobs (
  id bigint generated always as identity primary key,
  configuration_id uuid not null references public.excel_sync_configurations(id) on delete cascade,
  registration_id uuid,
  athlete_id uuid,
  action text not null default 'upsert_registration'
    check (action in ('upsert_registration','delete_registration','reconcile')),
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','SUCCESS','FAILED','RETRYING','SKIPPED_DISABLED','REVIEW_REQUIRED')),
  payload jsonb not null default '{}'::jsonb,
  retry_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_excel_jobs_pending on public.excel_sync_jobs (status, created_at);
create unique index if not exists uq_excel_jobs_dedupe
  on public.excel_sync_jobs (configuration_id, coalesce(registration_id, '00000000-0000-0000-0000-000000000000'::uuid), action)
  where status in ('PENDING','RETRYING');

-- 4) Mapping stabil baris Excel (identitas: config + registration, BUKAN nomor baris)
create table if not exists public.excel_sync_row_mappings (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.excel_sync_configurations(id) on delete cascade,
  registration_id uuid,
  athlete_id uuid,
  excel_row int not null,
  athlete_key text,                          -- kunci nama ternormalisasi utk rebuild
  athlete_name text,
  synced_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (configuration_id, registration_id)
);

-- 5) Log aktivitas sync (audit terpisah dari audit_logs umum)
create table if not exists public.excel_sync_logs (
  id bigint generated always as identity primary key,
  action text not null check (action in (
    'SYNC_CREATED','SYNC_UPDATED','SYNC_ENABLED','SYNC_DISABLED',
    'SYNC_STARTED','SYNC_SUCCESS','SYNC_SKIPPED_DISABLED','SYNC_RETRY',
    'SYNC_FAILED','SYNC_RECONCILED','SYNC_REVIEW_REQUIRED',
    'CONFIG_CREATED','CONFIG_UPDATED','CONFIG_DELETED',
    'GLOBAL_ENABLED','GLOBAL_DISABLED')),
  configuration_id uuid,
  event_id uuid,
  registration_id uuid,
  athlete_id uuid,
  detail jsonb not null default '{}'::jsonb,
  error_message text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_excel_logs_created on public.excel_sync_logs (created_at desc);

-- RLS: deny-all untuk anon/authenticated; service role melewati RLS.
alter table public.excel_sync_settings enable row level security;
alter table public.excel_sync_configurations enable row level security;
alter table public.excel_sync_jobs enable row level security;
alter table public.excel_sync_row_mappings enable row level security;
alter table public.excel_sync_logs enable row level security;

-- 6) Trigger outbox: perubahan pendaftaran/payment → enqueue job.
--    Idempoten: dedupe unik mencegah job ganda saat masih PENDING/RETRYING;
--    webhook ganda aman karena worker fetch current-state, bukan delta.
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

  insert into public.excel_sync_jobs (configuration_id, registration_id, athlete_id, action)
  select c.id, v_reg_id, v_athlete, v_action
    from public.excel_sync_configurations c
   where c.event_id = v_event_id and c.enabled and
         (select enabled from public.excel_sync_settings where id='global');
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

-- 7) RPC permanent delete event — atomic, admin-only via API gate + service role.
--    Hapus event-specific saja; atlet/user/global tidak tersentuh.
--    performance.event_id = SET NULL otomatis (historis selamat).
create or replace function public.rpc_permanent_delete_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_races int; v_regs int; v_entries int; v_payments int;
begin
  if p_event_id is null then
    raise exception 'event_id wajib';
  end if;

  select count(*) into v_races from public.event_races where event_id = p_event_id;
  select count(*) into v_regs from public.event_registrations where event_id = p_event_id;
  select count(*) into v_entries from public.event_registration_entries e
    join public.event_registrations r on r.id = e.registration_id where r.event_id = p_event_id;
  select count(*) into v_payments from public.event_payments where event_id = p_event_id;

  delete from public.event_registration_entries e
    using public.event_registrations r where r.id = e.registration_id and r.event_id = p_event_id;
  delete from public.event_relay_members m
    using public.event_relay_teams t where m.relay_team_id = t.id and t.event_id = p_event_id;
  delete from public.event_relay_teams where event_id = p_event_id;
  delete from public.event_payments where event_id = p_event_id;
  delete from public.event_registrations where event_id = p_event_id;
  delete from public.event_races where event_id = p_event_id;
  delete from public.events where id = p_event_id;

  if exists (select 1 from public.events where id = p_event_id) then
    raise exception 'verifikasi gagal: event masih ada';
  end if;

  return jsonb_build_object(
    'deleted', true, 'races', v_races, 'registrations', v_regs,
    'entries', v_entries, 'payments', v_payments);
end $$;

-- Komentar dokumentasi
comment on table public.excel_sync_configurations is 'Konfigurasi sinkronisasi Database->Excel per event (universal, multi-file).';
comment on table public.excel_sync_jobs is 'Outbox queue sync; diisi trigger, dikonsumsi worker RDP.';
