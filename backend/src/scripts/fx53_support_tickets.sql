-- Support tickets for contextual ReadyRoute customer support.
-- Apply in Supabase before enabling the support form in production.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_reference text not null unique,
  account_id uuid references public.accounts(id) on delete set null,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  requester_type text not null default 'public',
  requester_name text not null,
  requester_email text not null,
  requester_phone text,
  requester_role text,
  company_name text,
  category text not null default 'other',
  urgency text not null default 'question',
  priority text not null default 'low',
  status text not null default 'new',
  subject text,
  description text not null,
  request_call boolean not null default false,
  source text,
  app_surface text,
  app_version text,
  page_url text,
  user_agent text,
  context jsonb,
  internal_notes text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_requester_type_check check (requester_type in ('public', 'manager', 'driver')),
  constraint support_tickets_category_check check (category in (
    'login',
    'routes',
    'manifest',
    'driver_app',
    'manager_portal',
    'vehicle_inspection',
    'vehicles',
    'billing',
    'maps_location',
    'onboarding',
    'bug',
    'feature_request',
    'other'
  )),
  constraint support_tickets_urgency_check check (urgency in ('blocking_today', 'needs_help_soon', 'question', 'low')),
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_tickets_status_check check (status in ('new', 'open', 'waiting_on_customer', 'resolved', 'closed'))
);

create index if not exists support_tickets_account_created_idx
  on public.support_tickets (account_id, created_at desc);

create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);

create index if not exists support_tickets_requester_email_idx
  on public.support_tickets (requester_email);
