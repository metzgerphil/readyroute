create table if not exists public.readyroute_operating_costs (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  category text not null default 'other',
  vendor text not null,
  amount_cents integer not null default 0,
  billing_date date,
  is_recurring boolean not null default true,
  notes text,
  receipt_url text,
  created_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint readyroute_operating_costs_amount_nonnegative check (amount_cents >= 0),
  constraint readyroute_operating_costs_category_check check (
    category in (
      'ai_tools',
      'vercel',
      'google_cloud_run',
      'supabase',
      'email',
      'maps',
      'apple_developer',
      'stripe_fees',
      'domains',
      'software',
      'other'
    )
  )
);

create index if not exists readyroute_operating_costs_period_idx
  on public.readyroute_operating_costs (period_month desc, billing_date desc);

create index if not exists readyroute_operating_costs_category_idx
  on public.readyroute_operating_costs (category, period_month desc);

alter table public.readyroute_operating_costs enable row level security;
