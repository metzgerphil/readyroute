alter table public.vedr_settings
  add column if not exists provider_login_url text;

alter table public.vedr_settings
  add column if not exists provider_username_hint text;
