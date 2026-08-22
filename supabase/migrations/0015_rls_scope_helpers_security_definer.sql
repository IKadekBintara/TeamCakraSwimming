-- RLS scope helpers must not re-trigger row level security on the tables they
-- inspect, otherwise policies that call them recurse until the statement dies
-- with "stack depth limit exceeded". They now follow the existing
-- security-definer pattern already used by public."current_role"().
-- Bodies unchanged: every helper still resolves strictly from auth.uid().

CREATE OR REPLACE FUNCTION public.parent_athlete_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  select a.id from public.athletes a
  join public.parents p on p.id = a.parent_id
  where p.user_id = auth.uid()
$fn$;

CREATE OR REPLACE FUNCTION public.my_athlete_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  select id from public.athletes where user_id = auth.uid() limit 1
$fn$;

CREATE OR REPLACE FUNCTION public.coach_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  select tg.id from public.training_groups tg
  join public.coaches c on c.id = tg.coach_id
  where c.user_id = auth.uid()
$fn$;

CREATE OR REPLACE FUNCTION public.leader_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  select id from public.training_groups
  where leader_id = auth.uid()
    and public."current_role"() in ('group_leader', 'ketua_kelompok')
$fn$;

CREATE OR REPLACE FUNCTION public.my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  select id from public.training_groups
  where id in (select public.coach_group_ids())
     or id in (select public.leader_group_ids())
$fn$;

CREATE OR REPLACE FUNCTION public.my_group_athlete_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  select m.athlete_id from public.training_group_members m
  where m.left_at is null and m.group_id in (select public.my_group_ids())
$fn$;

REVOKE ALL ON FUNCTION public.parent_athlete_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_athlete_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coach_group_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leader_group_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_group_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_group_athlete_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_athlete_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_athlete_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_group_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.leader_group_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_group_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_group_athlete_ids() TO authenticated;
