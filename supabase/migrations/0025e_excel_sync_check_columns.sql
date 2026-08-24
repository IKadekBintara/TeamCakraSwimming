-- 0025e: hasil Test Connection & Dry Run per konfigurasi.
-- Worker RDP menulis hasil; UI membaca via GET /api/admin/excel-sync.
alter table public.excel_sync_configurations
  add column if not exists last_check jsonb,
  add column if not exists last_dry_run jsonb,
  add column if not exists last_check_at timestamptz,
  add column if not exists last_dry_run_at timestamptz;
