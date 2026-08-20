alter table public.early_access_signups
  add column if not exists ai_processing_authorized boolean not null default false,
  add column if not exists ai_processing_policy_version text,
  add column if not exists ai_processing_authorized_at timestamptz,
  add column if not exists cxpc_phone_number text,
  add column if not exists csa_phone_number text,
  add column if not exists manager_phone_number text;

alter table public.accounts
  add column if not exists rra_ai_processing_authorized boolean not null default false,
  add column if not exists rra_ai_processing_policy_version text,
  add column if not exists rra_ai_processing_authorized_at timestamptz,
  add column if not exists rra_ai_processing_authorized_by uuid references public.manager_users(id) on delete set null,
  add column if not exists rra_ai_processing_withdrawn_at timestamptz,
  add column if not exists rra_ai_processing_withdrawn_by uuid references public.manager_users(id) on delete set null,
  add column if not exists rra_cxpc_phone_number text,
  add column if not exists rra_csa_phone_number text,
  add column if not exists rra_primary_manager_name text,
  add column if not exists rra_primary_manager_phone_number text;

create table if not exists public.driver_help_ai_notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_type text not null,
  actor_id uuid not null,
  policy_version text not null,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_help_ai_notices_actor_check check (actor_type in ('driver', 'manager')),
  unique (account_id, actor_type, actor_id, policy_version)
);

create index if not exists driver_help_ai_notices_account_idx
  on public.driver_help_ai_notices (account_id, seen_at desc);

alter table public.driver_help_ai_notices enable row level security;
grant all privileges on table public.driver_help_ai_notices to service_role;

create table if not exists public.rra_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  recipient_email text not null,
  recipient_type text not null,
  recipient_id uuid,
  message_type text not null,
  provider text not null default 'resend',
  provider_message_id text,
  delivery_status text not null default 'accepted',
  failure_reason text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rra_email_deliveries_recipient_type_check check (
    recipient_type in ('driver', 'manager', 'staff')
  ),
  constraint rra_email_deliveries_status_check check (
    delivery_status in ('accepted', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed', 'not_configured')
  )
);

create unique index if not exists rra_email_deliveries_provider_message_uidx
  on public.rra_email_deliveries (provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists rra_email_deliveries_account_idx
  on public.rra_email_deliveries (account_id, requested_at desc);

create index if not exists rra_email_deliveries_recipient_idx
  on public.rra_email_deliveries (lower(recipient_email), requested_at desc);

alter table public.rra_email_deliveries enable row level security;
grant all privileges on table public.rra_email_deliveries to service_role;

create table if not exists public.rra_email_webhook_events (
  webhook_event_id text primary key,
  provider text not null default 'resend',
  event_type text not null,
  provider_message_id text,
  event_created_at timestamptz,
  received_at timestamptz not null default now()
);

alter table public.rra_email_webhook_events enable row level security;
grant all privileges on table public.rra_email_webhook_events to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260820200000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
