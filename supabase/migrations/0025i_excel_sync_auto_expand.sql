-- 0025i: konfigurasi auto-expand area peserta + penanda blok signature per config.
-- Default server-side agar semua jalur INSERT existing tetap kompatibel.
alter table public.excel_sync_configurations
  add column if not exists auto_expand boolean not null default true,
  add column if not exists signature_marker text not null default 'TEAM CAKRA';
