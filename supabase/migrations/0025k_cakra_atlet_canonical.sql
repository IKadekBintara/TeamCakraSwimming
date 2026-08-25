-- ============================================================
-- 20260825120000_cakra_atlet_canonical.sql
-- Normalisasi "Team Cakra Atlet" → "Cakra Atlet" (canonical)
-- + guard anti-regresi (CHECK + trigger) di database layer.
-- Entitas lain (Team Cakra 1/2/3/6 di training_groups, brand
-- "TEAM CAKRA SWIMMING", Cakra 1/Cakra 2, dsb.) TIDAK disentuh.
-- ============================================================

-- 1) Migrasi DATA: event_payments.cakra historis
update public.event_payments
   set cakra = 'Cakra Atlet'
 where cakra is not null
   and trim(cakra) <> ''
   and lower(regexp_replace(cakra, '\s+', ' ', 'g')) = 'team cakra atlet';

-- 2) Resolusi entitas training_groups:
--    hanya ADA SATU baris "Team Cakra Atlet" (tidak ada duplikat ID),
--    jadi cukup RENAME in-place — id & relasi member tetap utuh.
update public.training_groups
   set name = 'Cakra Atlet'
 where lower(regexp_replace(name, '\s+', ' ', 'g')) = 'team cakra atlet';

-- 3) Guard DB layer: cegah nilai non-kanonik masuk lagi (case-insensitive,
--    whitespace-toleran). CHECK membandingkan bentuk ternormalisasi.
alter table public.event_payments
  add constraint event_payments_cakra_canonical_chk
  check (cakra is null or cakra = ''
         or lower(regexp_replace(cakra, '\s+', ' ', 'g')) <> 'team cakra atlet');

alter table public.athletes
  add constraint athletes_cakra_canonical_chk
  check (cakra is null or cakra = ''
         or lower(regexp_replace(cakra, '\s+', ' ', 'g')) <> 'team cakra atlet');

alter table public.training_groups
  add constraint training_groups_name_canonical_chk
  check (lower(regexp_replace(name, '\s+', ' ', 'g')) <> 'team cakra atlet');

-- 4) Trigger normalisasi otomatis: variasi penulisan apa pun
--    ("Team Cakra Atlet", "team cakra atlet", "TEAM  CAKRA  ATLET")
--    ditulis ulang menjadi canonical saat INSERT/UPDATE.
create or replace function public.cakra_normalize()
returns trigger language plpgsql as $$
begin
  if new.cakra is not null and btrim(new.cakra) <> '' then
    if lower(regexp_replace(new.cakra, '\s+', ' ', 'g')) = 'team cakra atlet' then
      new.cakra := 'Cakra Atlet';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cakra_normalize on public.event_payments;
create trigger trg_cakra_normalize
  before insert or update on public.event_payments
  for each row execute function public.cakra_normalize();

drop trigger if exists trg_ath_cakra_normalize on public.athletes;
create trigger trg_ath_cakra_normalize
  before insert or update on public.athletes
  for each row execute function public.cakra_normalize();
