create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null,
  staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  requester_email text,
  body text not null,
  is_internal boolean not null default false,
  email_delivered boolean not null default false,
  email_provider_id text,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_author_type_check
    check (author_type in ('staff', 'requester', 'system')),
  constraint support_ticket_messages_body_check
    check (char_length(body) between 1 and 12000)
);

create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete cascade,
  uploader_type text not null,
  staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_bucket text not null default 'support-attachments',
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint support_ticket_attachments_uploader_type_check
    check (uploader_type in ('staff', 'requester')),
  constraint support_ticket_attachments_size_check
    check (size_bytes > 0 and size_bytes <= 8388608),
  unique (storage_bucket, storage_path)
);

create index if not exists support_ticket_attachments_ticket_created_idx
  on public.support_ticket_attachments (ticket_id, created_at);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_events_ticket_created_idx
  on public.support_ticket_events (ticket_id, created_at);

create table if not exists public.readyroute_staff_company_access_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.readyroute_staff_users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  support_ticket_id uuid references public.support_tickets(id) on delete set null,
  reason text not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  ended_at timestamptz,
  request_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint readyroute_staff_company_access_status_check
    check (status in ('active', 'ended', 'expired')),
  constraint readyroute_staff_company_access_reason_check
    check (char_length(reason) between 10 and 1000)
);

create index if not exists readyroute_staff_company_access_staff_idx
  on public.readyroute_staff_company_access_sessions (staff_user_id, status, created_at desc);

create index if not exists readyroute_staff_company_access_account_idx
  on public.readyroute_staff_company_access_sessions (account_id, created_at desc);

create table if not exists public.readyroute_operating_cost_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'other',
  vendor text not null,
  default_amount_cents integer not null default 0,
  billing_day smallint,
  notes text,
  is_active boolean not null default true,
  created_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint readyroute_operating_cost_templates_amount_check check (default_amount_cents >= 0),
  constraint readyroute_operating_cost_templates_billing_day_check check (billing_day between 1 and 31),
  constraint readyroute_operating_cost_templates_category_check check (
    category in (
      'ai_tools', 'vercel', 'google_cloud_run', 'supabase', 'email', 'maps',
      'apple_developer', 'stripe_fees', 'domains', 'software', 'other'
    )
  )
);

alter table public.readyroute_operating_costs
  add column if not exists template_id uuid references public.readyroute_operating_cost_templates(id) on delete set null,
  add column if not exists import_batch_id uuid;

create unique index if not exists readyroute_operating_costs_template_period_uidx
  on public.readyroute_operating_costs (template_id, period_month)
  where template_id is not null;

create index if not exists readyroute_operating_cost_templates_active_idx
  on public.readyroute_operating_cost_templates (is_active, vendor);

insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do update set public = false;

alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;
alter table public.support_ticket_events enable row level security;
alter table public.readyroute_staff_company_access_sessions enable row level security;
alter table public.readyroute_operating_cost_templates enable row level security;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260712150000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
