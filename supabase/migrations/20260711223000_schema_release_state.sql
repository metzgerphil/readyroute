create table if not exists public.readyroute_schema_state (
  id boolean primary key default true check (id),
  version text not null,
  applied_at timestamptz not null default now()
);

alter table public.readyroute_schema_state enable row level security;

revoke all on table public.readyroute_schema_state from anon, authenticated;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260711223000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
