-- Store the operational Cakra group without changing existing athlete records.
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS cakra text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'athletes_cakra_valid_check'
      AND conrelid = 'public.athletes'::regclass
  ) THEN
    ALTER TABLE public.athletes
      ADD CONSTRAINT athletes_cakra_valid_check
      CHECK (cakra IS NULL OR cakra IN ('Cakra 1','Cakra 2','Cakra 3','Cakra 4','Cakra 5','Cakra 6','Cakra Atlet','Cakra Azzahro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS athletes_cakra_idx ON public.athletes(cakra);
