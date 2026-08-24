-- 0025g: last_sync_at per konfigurasi (stempel waktu sync sukses terakhir oleh worker).
alter table public.excel_sync_configurations
  add column if not exists last_sync_at timestamptz;
