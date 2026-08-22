-- Per-event age group (KU) configuration.
-- Events WITHOUT configuration rows keep the legacy global KU behaviour, so
-- historical events are never affected. Once an event HAS configurations, the
-- registration RPC validates the effective KU (override wins) against the
-- enabled rows and their birth-year windows / allowed race lists.

CREATE TABLE IF NOT EXISTS public.event_ku_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ku_label text NOT NULL,
  birth_year_start integer,
  birth_year_end integer,
  allowed_races uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ku_configurations_event_label_key UNIQUE (event_id, ku_label),
  CONSTRAINT event_ku_configurations_year_range_check CHECK (
    birth_year_start IS NULL OR birth_year_end IS NULL OR birth_year_start <= birth_year_end
  )
);

ALTER TABLE public.event_ku_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ku_config_staff_read ON public.event_ku_configurations;
CREATE POLICY ku_config_staff_read ON public.event_ku_configurations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS ku_config_admin_write ON public.event_ku_configurations;
CREATE POLICY ku_config_admin_write ON public.event_ku_configurations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Registration RPC v3: adds per-event KU validation on top of v2 guards.
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
AS $fn$
DECLARE
  v_registration_id uuid;
  v_event public.events%ROWTYPE;
  v_race_count integer;
  v_requested_count integer;
  v_amount numeric := GREATEST(COALESCE(p_amount_paid, 0), 0);
  v_status text := COALESCE(p_payment_status, 'BELUM_BAYAR');
  v_birth_date text;
  v_birth_year integer;
  v_effective_ku text;
  v_ku_count integer;
  v_cfg public.event_ku_configurations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi login diperlukan';
  END IF;
  IF NOT (public.is_staff() OR p_athlete_id IN (SELECT public.parent_athlete_ids()) OR p_athlete_id = public.my_athlete_id()) THEN
    RAISE EXCEPTION 'Tidak memiliki akses mendaftarkan atlet ini';
  END IF;
  IF COALESCE(p_ku, '') = '' THEN
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

  -- Per-event KU configuration (when present) constrains the effective KU.
  v_effective_ku := COALESCE(NULLIF(p_ku_override, ''), p_ku);
  SELECT count(*) INTO v_ku_count FROM public.event_ku_configurations WHERE event_id = p_event_id;
  IF v_ku_count > 0 THEN
    SELECT a.birth_date INTO v_birth_date FROM public.athletes a WHERE a.id = p_athlete_id;
    v_birth_year := CASE WHEN v_birth_date ~ '^\d{4}' THEN substring(v_birth_date FROM 1 FOR 4)::integer ELSE NULL END;
    SELECT * INTO v_cfg FROM public.event_ku_configurations
      WHERE event_id = p_event_id AND enabled AND ku_label = v_effective_ku
      ORDER BY sort_order LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KU "%" tidak tersedia untuk event ini', v_effective_ku;
    END IF;
    IF COALESCE(NULLIF(p_ku_override, ''), '') = '' THEN
      IF (v_cfg.birth_year_start IS NOT NULL AND (v_birth_year IS NULL OR v_birth_year < v_cfg.birth_year_start))
        OR (v_cfg.birth_year_end IS NOT NULL AND (v_birth_year IS NULL OR v_birth_year > v_cfg.birth_year_end)) THEN
        RAISE EXCEPTION 'Tahun lahir atlet tidak masuk rentang KU "%"', v_cfg.ku_label;
      END IF;
    END IF;
    IF COALESCE(array_length(v_cfg.allowed_races, 1), 0) > 0 THEN
      IF EXISTS (SELECT 1 FROM unnest(p_race_ids) AS r(id) WHERE NOT r.id = ANY (v_cfg.allowed_races)) THEN
        RAISE EXCEPTION 'Ada nomor lomba di luar daftar KU "%"', v_cfg.ku_label;
      END IF;
    END IF;
  END IF;

  IF NOT public.is_staff() THEN
    IF COALESCE(p_payment_status, 'BELUM_BAYAR') <> 'BELUM_BAYAR' OR GREATEST(COALESCE(p_amount_paid, 0), 0) <> 0 THEN
      RAISE EXCEPTION 'Hanya admin dapat mencatat pembayaran';
    END IF;
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
    jsonb_build_object('event_id', p_event_id, 'athlete_id', p_athlete_id, 'race_ids', p_race_ids,
      'ku', v_effective_ku, 'payment_status', v_status));
  RETURN v_registration_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Atlet sudah memiliki pendaftaran pada event ini';
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_event_registration(uuid, uuid, text, text, uuid[], numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_event_registration(uuid, uuid, text, text, uuid[], numeric, text, text) TO authenticated;
