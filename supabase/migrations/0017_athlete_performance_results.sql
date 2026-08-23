-- Athlete Performance Tracking
-- Adds athlete_performance_results: coach/admin-recorded swimming results.
-- Purely additive; no existing tables, policies, or functions are modified.
-- Timing is stored as integer centiseconds (36.21s -> 3621) to avoid float
-- precision problems. NULL time = did not finish / disqualification.

create table if not exists public.athlete_performance_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  recorded_at date not null,
  stroke text not null,
  distance integer not null check (distance > 0),
  time_cs integer check (time_cs > 0),
  pool_length integer,
  event_id uuid references public.events(id) on delete set null,
  meet_name text,
  notes text,
  rank integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists perf_athlete_date_idx
  on public.athlete_performance_results (athlete_id, recorded_at desc);
create index if not exists perf_event_idx
  on public.athlete_performance_results (event_id);

alter table public.athlete_performance_results enable row level security;

-- Read scope mirrors athletes table:
--   staff (admin/operator): all rows
--   coach / ketua kelompok: their group athletes only
--   parent: own children only
create policy perf_staff_all
  on public.athlete_performance_results
  for all to authenticated
  using (
    public.is_staff()
    or athlete_id in (select public.my_group_athlete_ids())
    or athlete_id in (select public.parent_athlete_ids())
  )
  with check (
    public.is_staff()
    or athlete_id in (select public.my_group_athlete_ids())
  );

-- ============================================================
-- Audit trigger: CREATE_PERFORMANCE_RESULT / UPDATE / DELETE
-- Actor = auth.uid(); old/new value stored as JSONB snapshots.
-- No secrets are involved in these payloads.
-- ============================================================

create or replace function public.audit_performance_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, old_value, new_value)
  values (
    auth.uid(),
    case tg_op
      when 'INSERT' then 'CREATE_PERFORMANCE_RESULT'
      when 'UPDATE' then 'UPDATE_PERFORMANCE_RESULT'
      when 'DELETE' then 'DELETE_PERFORMANCE_RESULT'
    end,
    'athlete_performance_results',
    coalesce(new.id, old.id),
    case tg_op when 'DELETE' then to_jsonb(old) else null end,
    case tg_op when 'DELETE' then null else to_jsonb(coalesce(new, old)) end
  );
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists trg_audit_performance_result on public.athlete_performance_results;
create trigger trg_audit_performance_result
after insert or update or delete
on public.athlete_performance_results
for each row execute function public.audit_performance_result();

grant select on public.athlete_performance_results to authenticated;
