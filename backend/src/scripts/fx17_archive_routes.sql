alter table public.routes add column if not exists archived_at timestamptz;
alter table public.routes add column if not exists archived_reason text;

drop index if exists public.routes_work_area_date_account;

create unique index if not exists routes_work_area_date_account
on public.routes(account_id, work_area_name, date)
where archived_at is null;

create index if not exists routes_archived_at_idx on public.routes(archived_at);
