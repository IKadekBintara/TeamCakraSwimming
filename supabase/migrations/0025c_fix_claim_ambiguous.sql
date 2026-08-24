-- 0025c: perbaiki ambiguitas kolom id pada fn_excel_sync_claim_job
create or replace function public.fn_excel_sync_claim_job()
returns table (id bigint, configuration_id uuid, registration_id uuid, athlete_id uuid, action text, payload jsonb, retry_count int)
language plpgsql security definer set search_path = public as $$
declare
  v_job record;
begin
  -- kandidat: PENDING/RETRYING biasa, atau PROCESSING stale >10 menit (worker mati mendadak)
  select j.* into v_job from public.excel_sync_jobs j
   where j.status in ('PENDING','RETRYING')
      or (j.status = 'PROCESSING' and j.updated_at < now() - interval '10 minutes')
   order by j.created_at
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;
  update public.excel_sync_jobs set status='PROCESSING', updated_at=now()
   where excel_sync_jobs.id = v_job.id;
  return query select v_job.id, v_job.configuration_id, v_job.registration_id, v_job.athlete_id, v_job.action, v_job.payload, v_job.retry_count;
end $$;
