create table if not exists public.account_billing_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  committed_route_count integer not null default 0,
  billing_rate_cents integer not null default 1500,
  currency text not null default 'usd',
  free_month_started_on date,
  free_month_ends_on date,
  is_billing_exempt boolean not null default false,
  billing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_billing_settings_committed_route_count_check check (committed_route_count >= 0),
  constraint account_billing_settings_billing_rate_cents_check check (billing_rate_cents >= 0),
  constraint account_billing_settings_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint account_billing_settings_free_month_order_check check (
    free_month_started_on is null or free_month_ends_on is null or free_month_ends_on > free_month_started_on
  )
);

create table if not exists public.billing_manifest_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  route_date date not null,
  billing_period_start date not null,
  billing_period_end date not null,
  route_key text not null,
  route_display_name text not null,
  source text not null default 'manifest_upload',
  manifest_fingerprint text,
  manifest_layer_count integer not null default 0,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  imported_at timestamptz not null default now(),
  billing_exempt boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  constraint billing_manifest_imports_period_order_check check (billing_period_end > billing_period_start),
  constraint billing_manifest_imports_manifest_layer_count_check check (manifest_layer_count >= 0)
);

create table if not exists public.billable_route_months (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  billing_period_start date not null,
  billing_period_end date not null,
  route_key text not null,
  route_display_name text not null,
  first_route_id uuid references public.routes(id) on delete set null,
  last_route_id uuid references public.routes(id) on delete set null,
  first_imported_at timestamptz not null,
  last_imported_at timestamptz not null,
  status text not null default 'pending',
  stripe_usage_event_id text,
  stripe_invoice_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billable_route_months_period_order_check check (billing_period_end > billing_period_start),
  constraint billable_route_months_import_order_check check (last_imported_at >= first_imported_at),
  constraint billable_route_months_status_check check (status in ('pending', 'reported', 'invoiced', 'credited', 'void'))
);

create table if not exists public.billing_usage_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  billing_period_start date not null,
  billing_period_end date not null,
  committed_route_count integer not null default 0,
  imported_route_count integer not null default 0,
  billable_quantity integer not null default 0,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  stripe_subscription_id text,
  stripe_invoice_id text,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_usage_reports_period_order_check check (billing_period_end > billing_period_start),
  constraint billing_usage_reports_counts_check check (
    committed_route_count >= 0 and imported_route_count >= 0 and billable_quantity >= 0 and amount_cents >= 0
  ),
  constraint billing_usage_reports_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint billing_usage_reports_status_check check (status in ('draft', 'reported', 'invoiced', 'void'))
);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processing_status text not null default 'processed',
  processed_at timestamptz not null default now(),
  account_id uuid references public.accounts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  constraint stripe_webhook_events_processing_status_check check (processing_status in ('processed', 'failed', 'ignored'))
);

create unique index if not exists account_billing_settings_account_uidx
  on public.account_billing_settings(account_id);
create index if not exists billing_manifest_imports_account_period_idx
  on public.billing_manifest_imports(account_id, billing_period_start, imported_at desc);
create index if not exists billing_manifest_imports_route_idx
  on public.billing_manifest_imports(route_id, imported_at desc);
create unique index if not exists billable_route_months_account_period_route_uidx
  on public.billable_route_months(account_id, billing_period_start, route_key);
create index if not exists billable_route_months_account_period_idx
  on public.billable_route_months(account_id, billing_period_start);
create index if not exists billing_usage_reports_account_period_idx
  on public.billing_usage_reports(account_id, billing_period_start desc);
create index if not exists stripe_webhook_events_account_idx
  on public.stripe_webhook_events(account_id, processed_at desc);

alter table public.account_billing_settings enable row level security;
alter table public.billing_manifest_imports enable row level security;
alter table public.billable_route_months enable row level security;
alter table public.billing_usage_reports enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists account_billing_settings_by_account on public.account_billing_settings;
create policy account_billing_settings_by_account
on public.account_billing_settings
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists billing_manifest_imports_by_account on public.billing_manifest_imports;
create policy billing_manifest_imports_by_account
on public.billing_manifest_imports
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists billable_route_months_by_account on public.billable_route_months;
create policy billable_route_months_by_account
on public.billable_route_months
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists billing_usage_reports_by_account on public.billing_usage_reports;
create policy billing_usage_reports_by_account
on public.billing_usage_reports
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
