-- Scope group-leader metadata and event/payment reads to the assigned group.
create or replace function public.leader_group_ids()
returns setof uuid language sql stable as $$
  select id from public.training_groups
  where leader_id = auth.uid()
    and public.current_role() in ('group_leader', 'ketua_kelompok')
$$;

drop policy if exists groups_member_read on public.training_groups;
create policy groups_member_read on public.training_groups
  for select using (
    auth.role() = 'authenticated'
    and (public.current_role() not in ('group_leader', 'ketua_kelompok') or id in (select public.my_group_ids()))
  );

drop policy if exists sessions_read on public.training_sessions;
create policy sessions_read on public.training_sessions
  for select using (
    auth.role() = 'authenticated'
    and (public.current_role() not in ('group_leader', 'ketua_kelompok') or group_id in (select public.my_group_ids()))
  );

drop policy if exists schedules_read on public.training_schedules;
create policy schedules_read on public.training_schedules
  for select using (
    auth.role() = 'authenticated'
    and (public.current_role() not in ('group_leader', 'ketua_kelompok') or group_id in (select public.my_group_ids()))
  );

create policy registrations_ketua_read on public.event_registrations
  for select using (
    public.current_role() in ('group_leader', 'ketua_kelompok')
    and athlete_id in (select public.my_group_athlete_ids())
  );

create policy entries_ketua_read on public.event_registration_entries
  for select using (
    public.current_role() in ('group_leader', 'ketua_kelompok')
    and registration_id in (
      select id from public.event_registrations
      where athlete_id in (select public.my_group_athlete_ids())
    )
  );

create policy payments_ketua_read on public.event_payments
  for select using (
    public.current_role() in ('group_leader', 'ketua_kelompok')
    and athlete_id in (select public.my_group_athlete_ids())
  );
