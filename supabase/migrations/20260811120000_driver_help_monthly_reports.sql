alter table public.accounts
  add column if not exists driver_help_monthly_report_enabled boolean not null default true,
  add column if not exists driver_help_minutes_per_answer_estimate integer not null default 5;

alter table public.accounts
  drop constraint if exists accounts_driver_help_minutes_estimate_check;
alter table public.accounts
  add constraint accounts_driver_help_minutes_estimate_check
  check (driver_help_minutes_per_answer_estimate between 1 and 60);

create table if not exists public.driver_help_monthly_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  report_month date not null,
  recipient_email text not null,
  metrics jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'pending',
  provider_message_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_help_report_month_check check (report_month = date_trunc('month', report_month)::date),
  constraint driver_help_report_delivery_status_check check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  unique (account_id, report_month, recipient_email)
);

alter table public.driver_help_monthly_report_deliveries enable row level security;
grant all privileges on table public.driver_help_monthly_report_deliveries to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260811120000', now())
on conflict (id) do update set version = excluded.version, applied_at = excluded.applied_at;
