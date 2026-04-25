alter table public.routes
  add column if not exists dispatch_state text not null default 'staged',
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatched_by_manager_user_id uuid references public.manager_users(id) on delete set null;

alter table public.routes
  drop constraint if exists routes_dispatch_state_check;

alter table public.routes
  add constraint routes_dispatch_state_check
  check (dispatch_state in ('staged', 'dispatched'));
