-- ============================================================
-- Team Cakra Swimming — Events, Registrations & Manual Payments
-- Run after 0001_initial_schema.sql, 0002_storage.sql, 0003_seed_dev.sql
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  event_date date not null,
  location text,
  description text,
  registration_deadline date,
  fee_per_entry numeric(12,2) not null default 0 check (fee_per_entry >= 0),
  admin_fee numeric(12,2) not null default 0 check (admin_fee >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, event_date)
);

create table if not exists public.event_races (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  distance_m integer not null check (distance_m > 0),
  stroke text not null,
  allowed_kus text[] not null default '{}',
  is_relay boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.event_registrations (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete restrict,
  athlete_id uuid not null references public.athletes(id) on delete restrict,
  ku text not null,
  ku_override text,
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'CANCELLED')),
  registered_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, athlete_id)
);

create table if not exists public.event_registration_entries (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references public.event_registrations(id) on delete restrict,
  race_id uuid not null references public.event_races(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (registration_id, race_id)
);

create table if not exists public.event_relay_teams (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete restrict,
  race_id uuid not null references public.event_races(id) on delete restrict,
  team_name text not null,
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'CANCELLED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_relay_members (
  id uuid primary key default uuid_generate_v4(),
  relay_team_id uuid not null references public.event_relay_teams(id) on delete restrict,
  athlete_id uuid not null references public.athletes(id) on delete restrict,
  birth_date_snapshot date,
  member_order smallint not null check (member_order between 1 and 8),
  created_at timestamptz not null default now(),
  unique (relay_team_id, athlete_id),
  unique (relay_team_id, member_order)
);

create table if not exists public.payment_settings (
  id boolean primary key default true,
  bank_name text,
  account_number text,
  account_name text,
  ewallet_name text,
  ewallet_number text,
  instructions text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_payments (
  id uuid primary key default uuid_generate_v4(),
  transaction_id text not null unique default ('DOLPHIN-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 10))),
  athlete_id uuid not null references public.athletes(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  registration_id uuid not null references public.event_registrations(id) on delete restrict,
  athlete_name text not null,
  cakra text,
  jumlah_nomor integer not null default 0 check (jumlah_nomor >= 0),
  registration_fee numeric(12,2) not null default 0 check (registration_fee >= 0),
  admin_fee numeric(12,2) not null default 0 check (admin_fee >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  remaining_amount numeric(12,2) not null default 0 check (remaining_amount >= 0),
  payment_method text,
  payment_destination text,
  payment_proof text,
  payment_status text not null default 'BELUM_BAYAR' check (payment_status in ('BELUM_BAYAR', 'MENUNGGU_VERIFIKASI', 'DP', 'LUNAS', 'DITOLAK', 'CANCELLED')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_status_date_idx on public.events(status, event_date);
create index if not exists event_races_event_idx on public.event_races(event_id, sort_order);
create index if not exists event_registrations_event_idx on public.event_registrations(event_id);
create index if not exists event_registrations_athlete_idx on public.event_registrations(athlete_id);
create index if not exists event_entries_registration_idx on public.event_registration_entries(registration_id);
create index if not exists event_payments_status_idx on public.event_payments(payment_status, created_at desc);
create index if not exists event_payments_event_idx on public.event_payments(event_id);
create index if not exists event_payments_athlete_idx on public.event_payments(athlete_id);

alter table public.events enable row level security;
alter table public.event_races enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_registration_entries enable row level security;
alter table public.event_relay_teams enable row level security;
alter table public.event_relay_members enable row level security;
alter table public.payment_settings enable row level security;
alter table public.event_payments enable row level security;

create policy events_staff_all on public.events for all using (public.is_staff()) with check (public.is_staff());
create policy events_authenticated_read on public.events for select using (auth.role() = 'authenticated');
create policy races_staff_all on public.event_races for all using (public.is_staff()) with check (public.is_staff());
create policy races_authenticated_read on public.event_races for select using (auth.role() = 'authenticated');

create policy registrations_staff_all on public.event_registrations for all using (public.is_staff()) with check (public.is_staff());
create policy registrations_parent_read on public.event_registrations for select using (athlete_id in (select public.parent_athlete_ids()));
create policy registrations_parent_insert on public.event_registrations for insert with check (athlete_id in (select public.parent_athlete_ids()) and registered_by = auth.uid());
create policy registrations_athlete_read on public.event_registrations for select using (athlete_id = public.my_athlete_id());
create policy entries_staff_all on public.event_registration_entries for all using (public.is_staff()) with check (public.is_staff());
create policy entries_parent_read on public.event_registration_entries for select using (registration_id in (select id from public.event_registrations where athlete_id in (select public.parent_athlete_ids())));
create policy entries_parent_insert on public.event_registration_entries for insert with check (registration_id in (select id from public.event_registrations where athlete_id in (select public.parent_athlete_ids())));

create policy relay_staff_all on public.event_relay_teams for all using (public.is_staff()) with check (public.is_staff());
create policy relay_authenticated_read on public.event_relay_teams for select using (auth.role() = 'authenticated');
create policy relay_members_staff_all on public.event_relay_members for all using (public.is_staff()) with check (public.is_staff());
create policy relay_members_authenticated_read on public.event_relay_members for select using (auth.role() = 'authenticated');

create policy payment_settings_admin_all on public.payment_settings for all using (public.is_admin()) with check (public.is_admin());
create policy payment_settings_authenticated_read on public.payment_settings for select using (auth.role() = 'authenticated');

create policy payments_staff_select on public.event_payments for select using (public.is_staff());
create policy payments_admin_all on public.event_payments for all using (public.is_admin()) with check (public.is_admin());
create policy payments_parent_read on public.event_payments for select using (athlete_id in (select public.parent_athlete_ids()));
create policy payments_athlete_read on public.event_payments for select using (athlete_id = public.my_athlete_id());
create policy payments_parent_insert_pending on public.event_payments for insert with check (
  athlete_id in (select public.parent_athlete_ids())
  and payment_status in ('BELUM_BAYAR', 'MENUNGGU_VERIFIKASI')
  and verified_by is null
);

-- Payment proof storage. Objects are public only through exact generated URLs;
-- credentials are never stored in the database.
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do nothing;

create policy "payment_proofs_authenticated_read" on storage.objects for select
  using (bucket_id = 'payment-proofs' and auth.role() = 'authenticated');
create policy "payment_proofs_authenticated_insert" on storage.objects for insert
  with check (bucket_id = 'payment-proofs' and auth.role() = 'authenticated');

-- Parent/athlete may submit or replace a proof while it is not verified.
create policy payments_owner_update_pending on public.event_payments for update
  using ((athlete_id in (select public.parent_athlete_ids()) or athlete_id = public.my_athlete_id()) and verified_by is null)
  with check (payment_status = 'MENUNGGU_VERIFIKASI' and verified_by is null);

-- Seed the requested event and reusable Dolphin races. Safe to rerun.
insert into public.events (name, event_date, location, description, registration_deadline, fee_per_entry, admin_fee, status)
values (
  'Dolphin Fun Swim 2026',
  '2026-09-20',
  'Kolam Renang Al-Kautsar, Kalipepe, Yosowilangun, Lumajang',
  'Dolphin Fun Swim 2026 — event renang Team Cakra Swimming.',
  '2026-09-13',
  55000,
  20000,
  'DRAFT'
)
on conflict do nothing;

insert into public.event_races (event_id, name, distance_m, stroke, allowed_kus, is_relay, sort_order)
select e.id, r.name, r.distance_m, r.stroke, r.allowed_kus, r.is_relay, r.sort_order
from public.events e
cross join (values
  ('25m Kick Bebas', 25, 'Kick Bebas', array['KU 2021-Keatas','KU 2020','KU 2019','KU V'], false, 1),
  ('25m Gaya Bebas', 25, 'Gaya Bebas', array['KU 2021-Keatas','KU 2020','KU 2019','KU V'], false, 2),
  ('50m Bebas', 50, 'Bebas', array['KU IV','KU III','KU II','KU I & Senior'], false, 3),
  ('50m Gaya Bebas', 50, 'Gaya Bebas', array['KU IV','KU III','KU II','KU I & Senior'], false, 4),
  ('Free Estafet KU V', 25, 'Free Estafet', array['KU V'], true, 5),
  ('Free Estafet KU IV', 50, 'Free Estafet', array['KU IV'], true, 6)
) as r(name, distance_m, stroke, allowed_kus, is_relay, sort_order)
where e.name = 'Dolphin Fun Swim 2026'
  and not exists (select 1 from public.event_races er where er.event_id = e.id and er.name = r.name);
