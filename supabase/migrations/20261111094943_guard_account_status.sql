-- Users can edit contact details. Status and role are managed through the admin API.
revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and account_status = 'ACTIVE'
$$;
