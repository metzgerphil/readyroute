ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS is_pickup boolean DEFAULT false;
