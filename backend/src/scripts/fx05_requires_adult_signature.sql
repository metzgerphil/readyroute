ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS requires_adult_signature boolean DEFAULT false;
