-- Allow events to be archived without deleting historical registrations/payments.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'));
