alter table public.manager_users drop constraint if exists manager_users_email_key;
drop index if exists public.manager_users_email_uidx;
drop index if exists public.manager_users_lower_email_uidx;
create unique index if not exists manager_users_account_email_uidx on public.manager_users(account_id, lower(email));
