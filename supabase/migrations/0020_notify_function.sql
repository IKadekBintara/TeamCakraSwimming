-- TEAM CAKRA SWIMMING — notify() function (mirror of applied migration comm_4b)
-- Idempotent in-app notification writer used by all triggers and the automation engine.

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
  insert into public.notification_dispatch_log (dispatch_key) values (v_key) on conflict do nothing;
  if not found then
    select nl.notification_id into v_id from public.notification_dispatch_log nl where nl.dispatch_key = v_key;
    if v_id is not null then return v_id; end if;
    delete from public.notification_dispatch_log where dispatch_key = v_key and notification_id is null;
    insert into public.notification_dispatch_log (dispatch_key) values (v_key);
  end if;
  insert into public.notifications (recipient_id, title, message, ntype, link_path)
  values (p_recipient, p_title, p_message, p_ntype, p_link)
  returning id into v_id;
  update public.notification_dispatch_log set notification_id = v_id where dispatch_key = v_key;
  return v_id;
end $$;
