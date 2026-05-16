create table if not exists public.vehicle_check_requirement_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  maintenance_requirement_mode text not null default 'option_1',
  weekly_inspection_day text not null default 'Monday',
  custom_daily_requirements jsonb not null default '{}'::jsonb,
  custom_weekly_requirements jsonb not null default '{}'::jsonb,
  updated_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_check_requirement_mode_check
    check (maintenance_requirement_mode in ('option_1', 'option_2', 'custom')),
  constraint vehicle_check_requirement_weekday_check
    check (weekly_inspection_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'))
);

create unique index if not exists vehicle_check_requirement_settings_account_uidx
  on public.vehicle_check_requirement_settings(account_id);
