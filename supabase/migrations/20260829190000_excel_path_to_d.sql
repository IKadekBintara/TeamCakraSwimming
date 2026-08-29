-- FASE 0: Alihkan file_path Excel Sync dari C: ke D: (idempotent — kedua kali = 0 row).
-- Sumber truth tetap Supabase; Excel = mirror administratif. File asli di C: tidak dihapus (snapshot cadangan).
update public.excel_sync_configurations
set file_path = 'D:\Projects\TeamCakraExcel\FORMULIR PENDAFTARAN A1.xlsx',
    updated_at = now()
where file_path like 'C:%';
