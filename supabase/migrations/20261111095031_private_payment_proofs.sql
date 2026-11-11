update storage.buckets
set public = false
where id = 'payment-proofs';

drop policy if exists payment_proofs_authenticated_read on storage.objects;
drop policy if exists payment_proofs_authenticated_insert on storage.objects;

-- The payment SELECT policies determine which signed proof links a user may open.
create policy payment_proofs_payment_read
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (select 1 from public.profiles where id = (select auth.uid()) and account_status = 'ACTIVE')
  and exists (
    select 1 from public.event_payments p
    where p.id = case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    end
  )
);

create policy payment_proofs_payment_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and exists (select 1 from public.profiles where id = (select auth.uid()) and account_status = 'ACTIVE')
  and exists (
    select 1 from public.event_payments p
    where p.id = case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    end
    and (public.is_admin() or (
      p.verified_by is null
      and (p.athlete_id = public.my_athlete_id() or p.athlete_id in (select public.parent_athlete_ids()))
    ))
  )
);
