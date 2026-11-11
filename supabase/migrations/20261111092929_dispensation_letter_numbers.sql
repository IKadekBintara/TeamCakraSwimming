create table public.dispensation_letter_numbers (
  sequence_no integer primary key check (sequence_no > 0),
  event_id uuid not null,
  athlete_id uuid not null,
  letter_number text not null unique,
  unique (event_id, athlete_id)
);

alter table public.dispensation_letter_numbers enable row level security;
revoke all on public.dispensation_letter_numbers from public, anon, authenticated;
grant select, insert on public.dispensation_letter_numbers to service_role;

-- Preserve the numbers printed on the two Piala KONI PDFs issued before this feature.
with previous_letters (athlete_name, sequence_no, letter_number) as (
  values
    ('SHERLY NISA AFELIA', 1, '001 DISP/TCSJ/XI/2026'),
    ('BINTANG RAYMOND LAGA WIRA', 2, '002 DISP/TCSJ/XI/2026')
)
insert into public.dispensation_letter_numbers (sequence_no, event_id, athlete_id, letter_number)
select distinct l.sequence_no, e.id, a.id, l.letter_number
from previous_letters l
join public.athletes a on upper(a.full_name) = l.athlete_name
join public.event_registrations r on r.athlete_id = a.id
join public.events e on e.id = r.event_id
where e.name = 'Piala KONI Open 2026 Antar Pelajar'
  and e.event_date = date '2026-11-22';

create function public.issue_dispensation_letter_number(p_event_id uuid, p_athlete_id uuid, p_issue_date date)
returns public.dispensation_letter_numbers
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_letter public.dispensation_letter_numbers;
  v_sequence integer;
  v_digits text;
  v_months constant text[] := array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
begin
  if p_issue_date is null or not exists (
    select 1 from public.event_registrations
    where event_id = p_event_id and athlete_id = p_athlete_id and status = 'REGISTERED'
  ) then
    raise exception using errcode = '22023', message = 'Registration or letter date is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.dispensation_letter_numbers', 0));

  select * into v_letter from public.dispensation_letter_numbers
  where event_id = p_event_id and athlete_id = p_athlete_id;
  if found then
    return v_letter;
  end if;

  select greatest(2, coalesce(max(sequence_no), 0)) + 1 into v_sequence
  from public.dispensation_letter_numbers;
  v_digits := v_sequence::text;
  insert into public.dispensation_letter_numbers (sequence_no, event_id, athlete_id, letter_number)
  values (
    v_sequence, p_event_id, p_athlete_id,
    pg_catalog.lpad(v_digits, greatest(3, length(v_digits)), '0')
      || ' DISP/TCSJ/' || v_months[extract(month from p_issue_date)::int]
      || '/' || pg_catalog.to_char(p_issue_date, 'YYYY')
  )
  returning * into v_letter;
  return v_letter;
end;
$$;

revoke all on function public.issue_dispensation_letter_number(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.issue_dispensation_letter_number(uuid, uuid, date) to service_role;
