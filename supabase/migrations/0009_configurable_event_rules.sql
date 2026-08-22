-- Configurable event rules and immutable registration price snapshots.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_whatsapp text,
  ADD COLUMN IF NOT EXISTS payment_instructions text;

ALTER TABLE public.event_races
  ADD COLUMN IF NOT EXISTS price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_registration_entries
  ADD COLUMN IF NOT EXISTS price_snapshot numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.event_races
  DROP CONSTRAINT IF EXISTS event_races_price_check;
ALTER TABLE public.event_races
  ADD CONSTRAINT event_races_price_check CHECK (price >= 0);

-- Existing race rows inherit the previous event-level fee. Existing payments remain unchanged.
UPDATE public.event_races er
SET price = CASE WHEN er.is_relay THEN 0 ELSE e.fee_per_entry END,
    is_free = er.is_relay
FROM public.events e
WHERE er.event_id = e.id
  AND er.price = 0
  AND er.is_free = false;

-- Existing registration entries receive the race price as their historical snapshot.
UPDATE public.event_registration_entries e
SET price_snapshot = er.price
FROM public.event_races er
WHERE e.race_id = er.id
  AND e.price_snapshot = 0;

CREATE INDEX IF NOT EXISTS event_races_active_price_idx ON public.event_races(event_id, is_active, price);
