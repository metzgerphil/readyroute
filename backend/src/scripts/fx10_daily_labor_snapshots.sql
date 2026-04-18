create table if not exists public.daily_labor_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  work_date date not null,
  finalized_at timestamptz not null default now(),
  finalized_by_system boolean not null default true,
  driver_count integer not null default 0,
  shift_count integer not null default 0,
  total_worked_hours numeric(10, 2) not null default 0,
  total_payable_hours numeric(10, 2) not null default 0,
  total_break_minutes integer not null default 0,
  total_lunch_minutes integer not null default 0,
  estimated_payroll numeric(10, 2) not null default 0
);

create table if not exists public.daily_driver_labor (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.daily_labor_snapshots(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  work_date date not null,
  hourly_rate numeric(10, 2) not null default 0,
  shift_count integer not null default 0,
  worked_hours numeric(10, 2) not null default 0,
  payable_hours numeric(10, 2) not null default 0,
  break_minutes integer not null default 0,
  lunch_minutes integer not null default 0,
  estimated_pay numeric(10, 2) not null default 0
);

alter table public.daily_labor_snapshots add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.daily_labor_snapshots add column if not exists work_date date;
alter table public.daily_labor_snapshots add column if not exists finalized_at timestamptz not null default now();
alter table public.daily_labor_snapshots add column if not exists finalized_by_system boolean not null default true;
alter table public.daily_labor_snapshots add column if not exists driver_count integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists shift_count integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_worked_hours numeric(10, 2) not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_payable_hours numeric(10, 2) not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_break_minutes integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_lunch_minutes integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists estimated_payroll numeric(10, 2) not null default 0;

alter table public.daily_driver_labor add column if not exists batch_id uuid references public.daily_labor_snapshots(id) on delete cascade;
alter table public.daily_driver_labor add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.daily_driver_labor add column if not exists driver_id uuid references public.drivers(id) on delete cascade;
alter table public.daily_driver_labor add column if not exists work_date date;
alter table public.daily_driver_labor add column if not exists hourly_rate numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists shift_count integer not null default 0;
alter table public.daily_driver_labor add column if not exists worked_hours numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists payable_hours numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists break_minutes integer not null default 0;
alter table public.daily_driver_labor add column if not exists lunch_minutes integer not null default 0;
alter table public.daily_driver_labor add column if not exists estimated_pay numeric(10, 2) not null default 0;

create index if not exists daily_labor_snapshots_account_date_idx
  on public.daily_labor_snapshots(account_id, work_date desc);

create unique index if not exists daily_labor_snapshots_account_date_uidx
  on public.daily_labor_snapshots(account_id, work_date);

create index if not exists daily_driver_labor_batch_id_idx
  on public.daily_driver_labor(batch_id);

create unique index if not exists daily_driver_labor_batch_driver_uidx
  on public.daily_driver_labor(batch_id, driver_id);
