-- Account management metadata. Passwords remain exclusively in Supabase Auth.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS force_password_reset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('ACTIVE','INACTIVE','SUSPENDED','DELETED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_account_status_idx ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
