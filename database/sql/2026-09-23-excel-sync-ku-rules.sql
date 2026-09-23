-- ============================================================
-- Excel Sync: aturan KU per-event (Juknis)
-- ============================================================
-- Menambahkan kolom `ku_rules` (jsonb, nullable) pada
-- excel_sync_configurations.
--
-- Kolom ini menyimpan aturan Kelompok Umur KHUSUS satu event:
--   { "ranges": [ {from,to,ku}, ... ], "races": { "KU-6B": [nama nomor, ...] } }
--
-- Worker menghitung KU dari TAHUN LAHIR atlet memakai `ku_rules` config
-- (bukan dari string `event_registrations.ku` yang bisa berasal dari skema
-- KU versi lama).
--
-- ADDITIVE & NULLABLE:
--   * config tanpa ku_rules  -> perilaku LAMA tidak berubah (aman utk Dolphin)
--   * tidak ada data existing yang diubah/dihapus
-- ============================================================

alter table public.excel_sync_configurations
  add column if not exists ku_rules jsonb;

comment on column public.excel_sync_configurations.ku_rules is
  'Aturan KU per-event (Juknis): {ranges:[{from,to,ku}], races:{KU:[nama nomor]}}. NULL = pakai string KU dari DB (perilaku lama).';
