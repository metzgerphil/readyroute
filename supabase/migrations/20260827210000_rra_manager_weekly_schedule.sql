alter table public.manager_users
  add column if not exists phone text;

create table if not exists public.rra_manager_weekly_schedule (
  account_id uuid not null references public.accounts(id) on delete cascade,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  manager_user_id uuid not null references public.manager_users(id) on delete restrict,
  updated_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, iso_weekday)
);

create index if not exists rra_manager_weekly_schedule_manager_idx
  on public.rra_manager_weekly_schedule (manager_user_id);

update public.manager_users as manager
set phone = account.rra_primary_manager_phone_number
from public.accounts as account
where manager.account_id = account.id
  and lower(manager.email) = lower(account.manager_email)
  and nullif(btrim(manager.phone), '') is null
  and nullif(btrim(account.rra_primary_manager_phone_number), '') is not null;

insert into public.rra_manager_weekly_schedule (account_id, iso_weekday, manager_user_id)
select account.id, weekday.iso_weekday, primary_manager.id
from public.accounts as account
cross join generate_series(1, 7) as weekday(iso_weekday)
cross join lateral (
  select manager.id
  from public.manager_users as manager
  where manager.account_id = account.id
    and manager.is_active = true
  order by
    case when lower(manager.email) = lower(account.manager_email) then 0 else 1 end,
    manager.created_at,
    manager.id
  limit 1
) as primary_manager
on conflict (account_id, iso_weekday) do nothing;

alter table public.rra_manager_weekly_schedule enable row level security;

drop policy if exists rra_manager_weekly_schedule_by_account on public.rra_manager_weekly_schedule;
create policy rra_manager_weekly_schedule_by_account
on public.rra_manager_weekly_schedule
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

revoke all on table public.rra_manager_weekly_schedule from anon, authenticated;

comment on table public.rra_manager_weekly_schedule is
  'Company-wide weekly manager contact schedule used by every ReadyRoute Answers driver.';
comment on column public.rra_manager_weekly_schedule.iso_weekday is
  'ISO weekday in the account operations timezone: Monday=1 through Sunday=7.';

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260827210000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
