alter table public.fedex_accounts add column if not exists fcc_username text;
alter table public.fedex_accounts add column if not exists fcc_password_encrypted text;
alter table public.fedex_accounts add column if not exists fcc_password_updated_at timestamptz;
