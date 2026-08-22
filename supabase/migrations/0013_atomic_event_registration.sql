-- Create event registration, entries, and initial payment atomically.
CREATE OR REPLACE FUNCTION public.create_event_registration(
  p_event_id uuid,
  p_athlete_id uuid,
  p_ku text,
  p_ku_override text DEFAULT NULL,
  p_race_ids uuid[] DEFAULT '{}',
  p_amount_paid numeric DEFAULT 0,
  p_payment_method text DEFAULT NULL,
  p_payment_status text DEFAULT 'BELUM_BAYAR'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration_id uuid;
  v_event public.events%ROWTYPE;
  v_race_count integer;
  v_requested_count integer;
  v_amount numeric := GREATEST(COALESCE(p_amount_paid, 0), 0);
  v_status text := COALESCE(p_payment_status, 'BELUM_BAYAR');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan';
  END IF;
  IF NOT (public.is_staff() OR p_athlete_id IN (SELECT public.parent_athlete_ids()) OR p_athlete_id = public.my_athlete_id()) THEN
    RAISE EXCEPTION 'Tidak memiliki akses mendaftarkan atlet ini';
  END IF;
  IF NOT COALESCE(p_ku, '') <> '' THEN
    RAISE EXCEPTION 'KU wajib diisi';
  END IF;
  IF COALESCE(array_length(p_race_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Minimal satu nomor lomba wajib dipilih';
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event tidak ditemukan'; END IF;
  IF v_event.status <> 'OPEN' THEN RAISE EXCEPTION 'Event belum berstatus OPEN'; END IF;
  IF v_event.registration_deadline IS NOT NULL AND CURRENT_DATE > v_event.registration_deadline THEN
    RAISE EXCEPTION 'Deadline pendaftaran event sudah lewat';
  END IF;
  SELECT count(DISTINCT id), count(*) INTO v_race_count, v_requested_count
  FROM public.event_races
  WHERE event_id = p_event_id AND is_active AND id = ANY(p_race_ids);
  IF v_race_count <> v_requested_count OR v_race_count <> COALESCE(array_length(p_race_ids, 1), 0) THEN
    RAISE EXCEPTION 'Nomor lomba tidak valid untuk event ini';
  END IF;
  IF NOT public.is_staff() THEN
    v_status := 'BELUM_BAYAR';
    v_amount := 0;
  ELSIF v_status NOT IN ('BELUM_BAYAR', 'DP', 'LUNAS') THEN
    RAISE EXCEPTION 'Status pembayaran admin tidak valid';
  END IF;
  IF v_amount < 0 THEN RAISE EXCEPTION 'Nominal dibayar tidak valid'; END IF;

  INSERT INTO public.event_registrations(event_id, athlete_id, ku, ku_override, registered_by)
  VALUES (p_event_id, p_athlete_id, p_ku, NULLIF(p_ku_override, ''), auth.uid())
  RETURNING id INTO v_registration_id;

  INSERT INTO public.event_registration_entries(registration_id, race_id)
  SELECT v_registration_id, r.id
  FROM public.event_races r
  WHERE r.id = ANY(p_race_ids)
  ORDER BY array_position(p_race_ids, r.id);

  INSERT INTO public.event_payments(
    athlete_id, event_id, registration_id, athlete_name, cakra, jumlah_nomor,
    registration_fee, admin_fee, total_amount, amount_paid, remaining_amount,
    payment_status, payment_method, payment_destination, submitted_by,
    submitted_at, verified_by, verified_at
  )
  SELECT a.id, p_event_id, v_registration_id, a.full_name, a.cakra,
    (SELECT count(*) FROM public.event_registration_entries WHERE registration_id = v_registration_id),
    0, 0, 0, v_amount, 0, v_status, NULLIF(p_payment_method, ''),
    CASE WHEN public.is_staff() AND v_amount > 0 THEN 'Admin' ELSE NULL END,
    auth.uid(), CASE WHEN v_amount > 0 THEN now() ELSE NULL END,
    CASE WHEN public.is_staff() AND v_amount > 0 THEN auth.uid() ELSE NULL END,
    CASE WHEN public.is_staff() AND v_amount > 0 THEN now() ELSE NULL END
  FROM public.athletes a WHERE a.id = p_athlete_id;

  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, new_value)
  VALUES (auth.uid(), 'CREATE_EVENT_REGISTRATION', 'event_registrations', v_registration_id,
    jsonb_build_object('event_id', p_event_id, 'athlete_id', p_athlete_id, 'race_ids', p_race_ids, 'payment_status', v_status));
  RETURN v_registration_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Atlet sudah memiliki pendaftaran pada event ini';
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_registration(uuid, uuid, text, text, uuid[], numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_event_registration(uuid, uuid, text, text, uuid[], numeric, text, text) TO authenticated;
