-- 0025f: aksi diagnostik worker (test_connection & dry_run)
alter table public.excel_sync_jobs drop constraint if exists excel_sync_jobs_action_check;
alter table public.excel_sync_jobs add constraint excel_sync_jobs_action_check
  check (action = any (array['upsert_registration'::text, 'delete_registration'::text, 'reconcile'::text, 'test_connection'::text, 'dry_run'::text]));
