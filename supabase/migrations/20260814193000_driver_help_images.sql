alter table public.driver_help_knowledge_records
  add column if not exists images jsonb not null default '[]'::jsonb;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'driver-help-images',
  'driver-help-images',
  false,
  10485760,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260814193000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
