-- Fix RLS policies on athlete_performance_results.
-- The previously applied migration collapsed into a single FOR ALL policy,
-- which unintentionally allowed in-scope coaches/group-leaders to DELETE rows.
-- Intended matrix:
--   SELECT : admin/operator OR coach/GL in group scope OR parent of own child
--   INSERT : admin/operator OR coach in group scope
--   UPDATE : admin/operator OR coach in group scope
--   DELETE : admin/operator ONLY

drop policy if exists perf_staff_all on public.athlete_performance_results;

drop policy if exists perf_select on public.athlete_performance_results;
create policy perf_select on public.athlete_performance_results
  for select to authenticated
  using (
    is_staff()
    or athlete_id in (select my_group_athlete_ids())
    or athlete_id in (select parent_athlete_ids())
  );

drop policy if exists perf_insert on public.athlete_performance_results;
create policy perf_insert on public.athlete_performance_results
  for insert to authenticated
  with check (
    is_staff()
    or athlete_id in (select my_group_athlete_ids())
  );

drop policy if exists perf_update on public.athlete_performance_results;
create policy perf_update on public.athlete_performance_results
  for update to authenticated
  using (
    is_staff()
    or athlete_id in (select my_group_athlete_ids())
  )
  with check (
    is_staff()
    or athlete_id in (select my_group_athlete_ids())
  );

drop policy if exists perf_delete on public.athlete_performance_results;
create policy perf_delete on public.athlete_performance_results
  for delete to authenticated
  using ( is_staff() );
