-- TEAM CAKRA SWIMMING — Communication & Notification infrastructure
-- Applied via Supabase migration "comm_1_templates_settings", "comm_2_notifications_preferences",
-- "comm_3_delivery_dispatch" (split for transport safety). Additive only.

-- ============ Part 1: templates + automation settings ============
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  channel text not null default 'in_app' check (channel in ('in_app','email','whatsapp')),
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_settings (
  id text primary key check (id in ('payment_reminder','event_deadline_reminder')),
  enabled boolean not null default false,
  offsets_hours int[] not null default '{24,48}',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.notification_templates enable row level security;
alter table public.automation_settings enable row level security;

create policy tpl_admin_all on public.notification_templates
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy tpl_staff_read on public.notification_templates
  for select to authenticated using (true);
create policy aset_admin_all on public.automation_settings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy aset_staff_read on public.automation_settings
  for select to authenticated using (true);

-- ============ Part 2: notifications + preferences ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null default '',
  ntype text not null check (ntype in ('PAYMENT','EVENT','REGISTRATION','ACCOUNT','ATTENDANCE','PERFORMANCE','SYSTEM')),
  link_path text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (recipient_id) where is_read = false;

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false
);

alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

create policy notif_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid() or public.is_staff());
create policy notif_update_own on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy nprefs_self on public.notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Part 3: delivery logs + idempotency dispatch log ============
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('in_app','email','whatsapp')),
  template_key text,
  status text not null check (status in ('QUEUED','SENT','FAILED')),
  attempts int not null default 1,
  error text,
  related_entity_type text,
  related_entity_id text,
  sent_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_deliveries_status on public.notification_deliveries (status, last_attempt_at desc);

create table if not exists public.notification_dispatch_log (
  dispatch_key text primary key,
  notification_id uuid references public.notifications(id) on delete set null,
  dispatched_at timestamptz not null default now()
);

alter table public.notification_deliveries enable row level security;
alter table public.notification_dispatch_log enable row level security;

create policy deliv_admin_all on public.notification_deliveries
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy dlog_none on public.notification_dispatch_log
  for all to authenticated using (false) with check (false);
