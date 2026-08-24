-- 0025d: job cleanup boleh orphan — configuration ikut CASCADE saat event
-- dihapus permanen, maka snapshot job TIDAK boleh mereferensikan config;
-- instruksi lengkap hidup di payload.jsonb.
alter table public.excel_sync_jobs alter column configuration_id drop not null;
