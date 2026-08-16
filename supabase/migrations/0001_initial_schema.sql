-- ============================================================
-- Absensi Team Cakra Swimming — Full Schema v2
-- TEAM CAKRA SWIMMING CLUB
-- Jalankan di Supabase SQL Editor (fresh project) atau `supabase db push`
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type app_role as enum ('admin', 'operator', 'coach', 'group_leader', 'athlete', 'parent');
create type athlete_status as enum ('ACTIVE', 'INACTIVE', 'LEFT_CLUB');
create type gender_type as enum ('M', 'F');
create type attendance_status as enum ('present', 'excused', 'sick', 'absent');

-- ---------- profiles (1:1 dengan auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role app_role not null default 'parent',
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- parents ----------
create table public.parents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  whatsapp text,
  address text,
  created_at timestamptz not null default now()
);

-- ---------- coaches ----------
create table public.coaches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  whatsapp text,
  created_at timestamptz not null default now()
);

-- ---------- training_groups (dinamis — TIDAK hardcode) ----------
create table public.training_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  location text,
  coach_id uuid references public.coaches(id) on delete set null,
  leader_id uuid references auth.users(id) on delete set null, -- ketua kelompok (user login)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- athletes ----------
create table public.athletes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null, -- akun login atlet (opsional)
  full_name text not null,
  nickname text,
  birth_date date,
  gender gender_type,
  school text,
  grade text,
  parent_id uuid references public.parents(id) on delete set null,
  parent_name text,
  whatsapp text,
  address text,
  photo_url text,
  program text,
  join_date date default current_date,
  status athlete_status not null default 'ACTIVE',
  left_at date,
  left_reason text,
  reactivated_at date,
  notes text,
  created_at timestamptz not null default now()
);

create index athletes_parent_idx on public.athletes(parent_id);
create index athletes_status_idx on public.athletes(status);
create index athletes_name_idx on public.athletes(full_name);
create index athletes_join_date_idx on public.athletes(join_date);
create index athletes_left_at_idx on public.athletes(left_at);

-- ---------- training_group_members (riwayat keanggotaan) ----------
create table public.training_group_members (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.training_groups(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now()
);

create unique index group_members_active_uniq
  on public.training_group_members(group_id, athlete_id) where left_at is null;
create index group_members_group_idx on public.training_group_members(group_id);
create index group_members_athlete_idx on public.training_group_members(athlete_id);

-- ---------- training_schedules (template mingguan, bisa lebih dari satu per grup) ----------
create table public.training_schedules (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.training_groups(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index training_schedules_group_idx on public.training_schedules(group_id);

-- ---------- training_sessions (sesi bertanggal) ----------
create table public.training_sessions (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.training_groups(id) on delete cascade,
  session_date date not null,
  start_time time,
  end_time time,
  location text,
  coach_id uuid references public.coaches(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (group_id, session_date)
);

create index training_sessions_date_idx on public.training_sessions(session_date);
create index training_sessions_group_idx on public.training_sessions(group_id);

-- ---------- attendance ----------
create table public.attendance (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete restrict,
  status attendance_status not null default 'present',
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, athlete_id)
);

create index attendance_session_idx on public.attendance(session_id);
create index attendance_athlete_idx on public.attendance(athlete_id);

-- ---------- audit_logs ----------
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- ============================================================
-- Helper functions untuk RLS
-- ============================================================

create or replace function public.current_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$ select public.current_role() = 'admin' $$;

create or replace function public.is_staff()
returns boolean language sql stable as $$ select public.current_role() in ('admin', 'operator') $$;

create or replace function public.is_coach()
returns boolean language sql stable as $$ select public.current_role() = 'coach' $$;

-- Grup yang dilatih user ini
create or replace function public.coach_group_ids()
returns setof uuid language sql stable as $$
  select tg.id from public.training_groups tg
  join public.coaches c on c.id = tg.coach_id
  where c.user_id = auth.uid()
$$;

-- Grup yang dipimpin ketua (group_leader)
create or replace function public.leader_group_ids()
returns setof uuid language sql stable as $$
  select id from public.training_groups where leader_id = auth.uid()
$$;

-- Grup yang bisa diakses user ini (coach atau ketua)
create or replace function public.my_group_ids()
returns setof uuid language sql stable as $$
  select id from public.training_groups
  where id in (select public.coach_group_ids())
     or id in (select public.leader_group_ids())
$$;

-- Anak-anak dari parent yang login
create or replace function public.parent_athlete_ids()
returns setof uuid language sql stable as $$
  select a.id from public.athletes a
  join public.parents p on p.id = a.parent_id
  where p.user_id = auth.uid()
$$;

-- Id atlet sendiri (login atlet)
create or replace function public.my_athlete_id()
returns uuid language sql stable as $$
  select id from public.athletes where user_id = auth.uid() limit 1
$$;

-- Atlet yang dapat dilihat coach/ketua (anggota aktif grupnya)
create or replace function public.my_group_athlete_ids()
returns setof uuid language sql stable as $$
  select m.athlete_id from public.training_group_members m
  where m.left_at is null and m.group_id in (select public.my_group_ids())
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.parents enable row level security;
alter table public.coaches enable row level security;
alter table public.training_groups enable row level security;
alter table public.training_group_members enable row level security;
alter table public.athletes enable row level security;
alter table public.training_schedules enable row level security;
alter table public.training_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;

-- profiles
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_staff());
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid() and role = public.current_role());

-- parents
create policy parents_staff_all on public.parents
  for all using (public.is_staff()) with check (public.is_staff());
create policy parents_select_own on public.parents
  for select using (user_id = auth.uid());

-- coaches
create policy coaches_staff_all on public.coaches
  for all using (public.is_staff()) with check (public.is_staff());
create policy coaches_select on public.coaches
  for select using (auth.role() = 'authenticated');

-- training_groups
create policy groups_staff_all on public.training_groups
  for all using (public.is_staff()) with check (public.is_staff());
create policy groups_member_read on public.training_groups
  for select using (auth.role() = 'authenticated');
create policy groups_leader_update on public.training_groups
  for update using (id in (select public.leader_group_ids()));

-- training_group_members
create policy members_staff_all on public.training_group_members
  for all using (public.is_staff()) with check (public.is_staff());
create policy members_coach_leader on public.training_group_members
  for select using (group_id in (select public.my_group_ids()));
create policy members_parent on public.training_group_members
  for select using (athlete_id in (select public.parent_athlete_ids()));
create policy members_athlete_self on public.training_group_members
  for select using (athlete_id = public.my_athlete_id());

-- athletes
create policy athletes_staff_all on public.athletes
  for all using (public.is_staff()) with check (public.is_staff());
create policy athletes_coach_leader_select on public.athletes
  for select using (id in (select public.my_group_athlete_ids()));
create policy athletes_coach_leader_update on public.athletes
  for update using (id in (select public.my_group_athlete_ids()));
create policy athletes_parent_select on public.athletes
  for select using (id in (select public.parent_athlete_ids()));
create policy athletes_self_select on public.athletes
  for select using (user_id = auth.uid());

-- schedules: semua role terautentikasi boleh membaca; staff mengelola
create policy schedules_staff_all on public.training_schedules
  for all using (public.is_staff()) with check (public.is_staff());
create policy schedules_read on public.training_schedules
  for select using (auth.role() = 'authenticated');

-- sessions
create policy sessions_staff_all on public.training_sessions
  for all using (public.is_staff()) with check (public.is_staff());
create policy sessions_coach_leader_all on public.training_sessions
  for all using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));
create policy sessions_read on public.training_sessions
  for select using (auth.role() = 'authenticated');

-- attendance
create policy attendance_staff_all on public.attendance
  for all using (public.is_staff()) with check (public.is_staff());
create policy attendance_coach_leader_all on public.attendance
  for all using (
    session_id in (
      select s.id from public.training_sessions s
      where s.group_id in (select public.my_group_ids())
    )
  )
  with check (
    session_id in (
      select s.id from public.training_sessions s
      where s.group_id in (select public.my_group_ids())
    )
  );
create policy attendance_parent_select on public.attendance
  for select using (athlete_id in (select public.parent_athlete_ids()));
create policy attendance_athlete_self on public.attendance
  for select using (athlete_id = public.my_athlete_id());

-- audit_logs: admin baca; siapa pun boleh insert log miliknya sendiri
create policy audit_admin_select on public.audit_logs
  for select using (public.is_admin());
create policy audit_insert on public.audit_logs
  for insert with check (actor_id = auth.uid() or actor_id is null);

-- ============================================================
-- Auto-create profile saat signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'parent');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
