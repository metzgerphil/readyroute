alter table public.property_intel add column if not exists access_code text;
alter table public.property_intel add column if not exists access_code_confirmed_at timestamptz;
alter table public.property_intel add column if not exists access_code_source text;
