-- TEAM CAKRA SWIMMING — notify() hardening + dispatch log integrity
-- Applied via migrations comm_8 (notify dangling-pointer fix + FK), comm_9 (drop legacy FK),
-- comm_10 (cleanup dangling rows). Additive/safe.

-- notify(): jangan percaya notification_id yang menunjuk notifikasi yang sudah terhapus.
-- Tanpa pengecekan ini, baris log basi membuat sweep menganggap "sudah terkirim"
-- padahal notifikasinya tidak ada (silent drop).
create or replace function public.notify(
  p_recipient uuid,
  p_ntype text,
  p_title text,
  p_message text default '',
  p_link text default null,
  p_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_key text := coalesce(p_key, 'manual:' || gen_random_uuid()::text);
begin
  if p_recipient is null then return null; end if;
  insert into public.notification_dispatch_log (dispatch_key) values (v_key) on conflict (dispatch_key) do nothing;
  if not found then
    select nl.notification_id into v_id from public.notification_dispatch_log nl where nl.dispatch_key = v_key;
    if v_id is not null and exists (select 1 from public.notifications n where n.id = v_id) then
      return v_id;
    end if;
    delete from public.notification_dispatch_log where dispatch_key = v_key;
    insert into public.notification_dispatch_log (dispatch_key) values (v_key);
  end if;
  insert into public.notifications (recipient_id, title, message, ntype, link_path)
  values (p_recipient, p_title, p_message, p_ntype, p_link)
  returning id into v_id;
  update public.notification_dispatch_log set notification_id = v_id where dispatch_key = v_key;
  return v_id;
end $$;

-- Satu FK dengan ON DELETE CASCADE: menghapus notifikasi membersihkan baris lognya
-- sehingga tidak pernah ada pointer basi.
alter table public.notification_dispatch_log
  add constraint fk_dispatch_notification
  foreign key (notification_id) references public.notifications(id) on delete cascade;

alter table public.notification_dispatch_log
  drop constraint if exists notification_dispatch_log_notification_id_fkey;

-- Bersihkan sisa pointer basi dari data lama.
delete from public.notification_dispatch_log nl
where nl.notification_id is not null
  and not exists (select 1 from public.notifications n where n.id = nl.notification_id);
