-- Enforce configurable pricing at the database boundary.
CREATE OR REPLACE FUNCTION public.snapshot_event_entry_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT CASE WHEN is_free THEN 0 ELSE price END INTO NEW.price_snapshot
  FROM public.event_races
  WHERE id = NEW.race_id;
  IF NEW.price_snapshot IS NULL THEN
    RAISE EXCEPTION 'Nomor lomba tidak ditemukan';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_entry_price_snapshot ON public.event_registration_entries;
CREATE TRIGGER event_entry_price_snapshot
BEFORE INSERT ON public.event_registration_entries
FOR EACH ROW EXECUTE FUNCTION public.snapshot_event_entry_price();

CREATE OR REPLACE FUNCTION public.calculate_event_payment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration_fee numeric(12,2);
  v_admin_fee numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(e.price_snapshot), 0) INTO v_registration_fee
  FROM public.event_registration_entries e
  WHERE e.registration_id = NEW.registration_id;
  SELECT COALESCE(admin_fee, 0) INTO v_admin_fee
  FROM public.events WHERE id = NEW.event_id;
  NEW.registration_fee := v_registration_fee;
  NEW.admin_fee := v_admin_fee;
  NEW.total_amount := v_registration_fee + v_admin_fee;
  NEW.amount_paid := GREATEST(COALESCE(NEW.amount_paid, 0), 0);
  IF NEW.amount_paid > NEW.total_amount THEN
    RAISE EXCEPTION 'Nominal dibayar melebihi total tagihan';
  END IF;
  NEW.remaining_amount := NEW.total_amount - NEW.amount_paid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_payment_total_calculation ON public.event_payments;
CREATE TRIGGER event_payment_total_calculation
BEFORE INSERT ON public.event_payments
FOR EACH ROW EXECUTE FUNCTION public.calculate_event_payment_total();
