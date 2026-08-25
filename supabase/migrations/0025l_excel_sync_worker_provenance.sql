-- ============================================================
-- 20260825140000_excel_sync_worker_provenance.sql
-- Provenance eksekusi worker RDP: kolom started_at + worker_id
-- pada excel_sync_jobs, worker_id pada excel_sync_settings.
-- ============================================================
alter table public.excel_sync_jobs
  add column if not exists started_at timestamptz,
  add column if not exists worker_id text;

alter table public.excel_sync_settings
  add column if not exists worker_id text;
