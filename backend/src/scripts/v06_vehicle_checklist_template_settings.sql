create table if not exists public.vehicle_checklist_template_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  fields jsonb not null default '[]'::jsonb,
  updated_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_checklist_template_settings_account_uidx
  on public.vehicle_checklist_template_settings(account_id);
