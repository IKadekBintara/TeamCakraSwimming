create unique index training_group_members_one_current_per_athlete
on public.training_group_members(athlete_id) where left_at is null;

create function public.change_training_group_membership(
  p_athlete_id uuid, p_group_id uuid, p_expected_member_id uuid
)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_member public.training_group_members;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception using errcode = '42501', message = 'Akses admin atau operator diperlukan.';
  end if;
  perform 1 from public.athletes where id = p_athlete_id for update;
  if not found then raise exception using errcode = '22023', message = 'Atlet tidak ditemukan.'; end if;

  select * into v_member from public.training_group_members
    where athlete_id = p_athlete_id and left_at is null;
  if v_member.id is distinct from p_expected_member_id then
    raise exception using errcode = '40001', message = 'Kelompok atlet sudah berubah. Muat ulang halaman.';
  end if;
  if v_member.group_id is not distinct from p_group_id then return; end if;

  if p_group_id is not null and not exists (
    select 1 from public.training_groups where id = p_group_id and is_active
  ) then
    raise exception using errcode = '22023', message = 'Kelompok tujuan tidak aktif atau tidak ditemukan.';
  end if;
  if v_member.id is not null then
    update public.training_group_members set left_at = v_today where id = v_member.id;
  end if;
  if p_group_id is not null then
    insert into public.training_group_members (group_id, athlete_id, joined_at)
    values (p_group_id, p_athlete_id, v_today);
  end if;
end;
$$;
revoke all on function public.change_training_group_membership(uuid,uuid,uuid) from public, anon;
grant execute on function public.change_training_group_membership(uuid,uuid,uuid) to authenticated;
