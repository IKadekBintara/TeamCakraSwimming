create table public.dispensation_letter_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  athlete_id uuid not null,
  athlete_name text not null,
  school text not null,
  letter_number text not null references public.dispensation_letter_numbers(letter_number),
  issue_date date not null,
  content_key text not null unique check (length(content_key) = 64),
  pdf_base64 text not null check (length(pdf_base64) between 1 and 5200000),
  created_at timestamptz not null default now()
);
create index dispensation_letter_history_event_recent
  on public.dispensation_letter_history(event_id, created_at desc, id desc);
alter table public.dispensation_letter_history enable row level security;
revoke all on public.dispensation_letter_history from public, anon, authenticated;
grant select, insert on public.dispensation_letter_history to service_role;
