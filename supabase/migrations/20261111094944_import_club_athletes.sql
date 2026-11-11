create function public.import_club_athletes(p_rows jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row jsonb;
  v_new public.athletes;
  v_id uuid;
  v_group uuid;
  v_count integer := 0;
begin
  if not coalesce(public.is_staff(), false) or not exists (
    select 1 from public.profiles where id = (select auth.uid()) and account_status = 'ACTIVE'
  ) then
    raise exception using errcode = '42501', message = 'Akses admin atau operator diperlukan.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception using errcode = '22023', message = 'Data impor tidak valid atau melebihi 1.000 baris.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.import_club_athletes', 0));
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_new := pg_catalog.jsonb_populate_record(null::public.athletes, v_row);
    v_new.full_name := upper(btrim(v_new.full_name));
    if nullif(v_new.full_name, '') is null or exists (
      select 1 from public.athletes a where upper(btrim(a.full_name)) = v_new.full_name
    ) then
      continue;
    end if;
    v_group := (v_row->>'group_id')::uuid;
    insert into public.athletes (
      full_name, nickname, birth_date, gender, school, grade, parent_name, whatsapp,
      address, program, cakra, status, notes
    ) values (
      v_new.full_name, v_new.nickname, v_new.birth_date, v_new.gender, v_new.school, v_new.grade,
      v_new.parent_name, v_new.whatsapp, v_new.address, v_new.program, v_new.cakra, v_new.status, v_new.notes
    ) returning id into v_id;
    if v_group is not null then
      insert into public.training_group_members (athlete_id, group_id, joined_at)
      values (v_id, v_group, (now() at time zone 'Asia/Jakarta')::date);
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    insert into public.audit_logs (actor_id, action, entity, new_value)
    values ((select auth.uid()), 'import_excel', 'athletes',
      jsonb_build_object('inserted', v_count, 'skipped', jsonb_array_length(p_rows) - v_count));
  end if;
  return v_count;
end;
$$;
revoke all on function public.import_club_athletes(jsonb) from public, anon;
grant execute on function public.import_club_athletes(jsonb) to authenticated;
