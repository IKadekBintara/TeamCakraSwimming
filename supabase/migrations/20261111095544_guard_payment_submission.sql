create function public.guard_payment_owner_update()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  v_submission_fields constant text[] := array[
    'amount_paid','remaining_amount','payment_method','payment_proof',
    'payment_status','submitted_at','updated_at'
  ];
begin
  if current_user <> 'authenticated' or coalesce(public.is_admin(), false) then
    return new;
  end if;

  if public.current_role() is null
    or old.payment_status not in ('BELUM_BAYAR','MENUNGGU_VERIFIKASI','DITOLAK')
    or new.payment_status is distinct from 'MENUNGGU_VERIFIKASI'
    or (to_jsonb(new) - v_submission_fields) is distinct from (to_jsonb(old) - v_submission_fields)
  then
    raise exception using errcode = '42501', message = 'Hanya data pengajuan bukti pembayaran yang boleh diubah.';
  end if;
  if new.amount_paid is null or new.amount_paid <= 0 or new.amount_paid > old.total_amount then
    raise exception using errcode = '22023', message = 'Nominal dibayar harus sesuai tagihan.';
  end if;
  if new.payment_proof is null or not exists (
    select 1 from storage.objects
    where bucket_id = 'payment-proofs' and name = new.payment_proof
      and split_part(name, '/', 1) = old.id::text
  ) then
    raise exception using errcode = '22023', message = 'Bukti pembayaran belum diunggah.';
  end if;

  if old.payment_status = 'DITOLAK' then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  new.remaining_amount := old.total_amount - new.amount_paid;
  new.submitted_at := now();
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_payment_owner_update
before update on public.event_payments
for each row execute function public.guard_payment_owner_update();

alter policy payments_owner_update_pending on public.event_payments
using (
  (athlete_id in (select public.parent_athlete_ids()) or athlete_id = public.my_athlete_id())
  and payment_status in ('BELUM_BAYAR','MENUNGGU_VERIFIKASI','DITOLAK')
  and (verified_by is null or payment_status = 'DITOLAK')
);

alter policy payment_proofs_payment_insert on storage.objects
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
      p.payment_status in ('BELUM_BAYAR','MENUNGGU_VERIFIKASI','DITOLAK')
      and (p.verified_by is null or p.payment_status = 'DITOLAK')
      and (p.athlete_id = public.my_athlete_id() or p.athlete_id in (select public.parent_athlete_ids()))
    ))
  )
);
