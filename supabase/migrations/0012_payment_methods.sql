-- Configurable payment methods without changing existing account data.
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ewallet_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cash_enabled boolean NOT NULL DEFAULT false;
