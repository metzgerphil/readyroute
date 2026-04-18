ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS sa_number text,
  ADD COLUMN IF NOT EXISTS contractor_name text;

ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS is_pickup boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_business boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_note boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sid text,
  ADD COLUMN IF NOT EXISTS ready_time text,
  ADD COLUMN IF NOT EXISTS close_time text,
  ADD COLUMN IF NOT EXISTS has_time_commit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_type text,
  ADD COLUMN IF NOT EXISTS has_pickup boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_delivery boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocode_accuracy text,
  ADD COLUMN IF NOT EXISTS delivery_type_code text,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS age_confirmed boolean DEFAULT false;

UPDATE public.stops
SET
  is_pickup = COALESCE(is_pickup, false),
  is_business = COALESCE(is_business, false),
  has_note = COALESCE(has_note, false),
  has_time_commit = COALESCE(has_time_commit, false),
  has_pickup = COALESCE(has_pickup, false),
  has_delivery = COALESCE(has_delivery, true),
  age_confirmed = COALESCE(age_confirmed, false);

ALTER TABLE public.stops
  ALTER COLUMN is_pickup SET DEFAULT false,
  ALTER COLUMN is_business SET DEFAULT false,
  ALTER COLUMN has_note SET DEFAULT false,
  ALTER COLUMN has_time_commit SET DEFAULT false,
  ALTER COLUMN has_pickup SET DEFAULT false,
  ALTER COLUMN has_delivery SET DEFAULT true,
  ALTER COLUMN age_confirmed SET DEFAULT false;

ALTER TABLE public.stops
  ALTER COLUMN is_pickup SET NOT NULL,
  ALTER COLUMN is_business SET NOT NULL,
  ALTER COLUMN has_note SET NOT NULL,
  ALTER COLUMN has_time_commit SET NOT NULL,
  ALTER COLUMN has_pickup SET NOT NULL,
  ALTER COLUMN has_delivery SET NOT NULL,
  ALTER COLUMN age_confirmed SET NOT NULL;
