create table if not exists public.driver_help_ai_consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  actor_type text not null,
  actor_id uuid not null,
  ai_processing_consent boolean not null default false,
  policy_version text not null,
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_help_ai_consents_actor_check check (
    (actor_type = 'driver' and driver_id = actor_id) or
    (actor_type = 'manager' and driver_id is null)
  ),
  unique (account_id, actor_type, actor_id)
);

create index if not exists driver_help_ai_consents_account_idx
  on public.driver_help_ai_consents (account_id, updated_at desc);

alter table public.driver_help_ai_consents enable row level security;
grant all privileges on table public.driver_help_ai_consents to service_role;

create table if not exists public.driver_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid not null unique references public.drivers(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  canceled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_account_deletion_status_check check (status in ('pending', 'processing', 'completed', 'canceled'))
);

create index if not exists driver_account_deletion_due_idx
  on public.driver_account_deletion_requests (status, scheduled_for);
alter table public.driver_account_deletion_requests enable row level security;
grant all privileges on table public.driver_account_deletion_requests to service_role;

alter table public.driver_help_interactions
  add column if not exists privacy_purged_at timestamptz;
alter table public.driver_help_feedback
  add column if not exists comment_purged_at timestamptz;
alter table public.driver_help_sessions
  add column if not exists context_purged_at timestamptz;

-- Learned routing uses the irreversible route key for matching. Do not retain
-- a copy of the driver's original normalized wording in answer memory.
update public.driver_help_answer_memory
set normalized_question = 'route:' || route_key
where normalized_question <> 'route:' || route_key;

create or replace function public.run_driver_help_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  interaction_rows integer := 0;
  feedback_rows integer := 0;
  session_rows integer := 0;
  deleted_rows integer := 0;
begin
  update public.driver_help_interactions
  set question = '[removed under retention policy]',
      normalized_question = '',
      answer_snapshot = null,
      more_info_snapshot = null,
      clarification_options = '[]'::jsonb,
      escalation_message = null,
      retrieval_candidates = '[]'::jsonb,
      interpretation_result = '{}'::jsonb,
      privacy_purged_at = p_now
  where created_at < p_now - interval '90 days'
    and privacy_purged_at is null
    and not exists (
      select 1 from public.driver_help_unanswered_questions unanswered
      where unanswered.interaction_id = driver_help_interactions.id
        and unanswered.status in ('open', 'reviewing')
    );
  get diagnostics interaction_rows = row_count;

  update public.driver_help_feedback
  set comment = null, comment_purged_at = p_now
  where created_at < p_now - interval '90 days'
    and comment is not null;
  get diagnostics feedback_rows = row_count;

  update public.driver_help_sessions
  set context = '{}'::jsonb, context_purged_at = p_now
  where last_interaction_at < p_now - interval '90 days'
    and context_purged_at is null;
  get diagnostics session_rows = row_count;

  update public.driver_help_unanswered_questions
  set question = '[removed under retention policy]', normalized_question = ''
  where status in ('resolved', 'dismissed')
    and coalesce(resolved_at, created_at) < p_now - interval '90 days'
    and question <> '[removed under retention policy]';

  delete from public.driver_help_feedback where created_at < p_now - interval '24 months';
  delete from public.driver_help_interactions
  where created_at < p_now - interval '24 months'
    and not exists (
      select 1 from public.driver_help_unanswered_questions unanswered
      where unanswered.interaction_id = driver_help_interactions.id
        and unanswered.status in ('open', 'reviewing')
    );
  get diagnostics deleted_rows = row_count;

  delete from public.driver_help_sessions where last_interaction_at < p_now - interval '24 months';

  return jsonb_build_object(
    'interaction_content_purged', interaction_rows,
    'feedback_comments_purged', feedback_rows,
    'session_contexts_purged', session_rows,
    'expired_interactions_deleted', deleted_rows,
    'completed_at', p_now
  );
end;
$$;

revoke all on function public.run_driver_help_retention(timestamptz) from public;
grant execute on function public.run_driver_help_retention(timestamptz) to service_role;

create or replace function public.process_due_driver_account_deletions(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row record;
  completed_count integer := 0;
begin
  for request_row in
    select id, driver_id
    from public.driver_account_deletion_requests
    where status = 'pending' and scheduled_for <= p_now
    for update skip locked
  loop
    update public.driver_account_deletion_requests
    set status = 'processing', updated_at = p_now
    where id = request_row.id;

    update public.drivers
    set name = 'Deleted Driver',
        email = 'deleted+' || request_row.driver_id::text || '@privacy.readyroute.invalid',
        username = null,
        phone = null,
        fedex_driver_id = null,
        password_hash = null,
        pin = 'deleted:' || request_row.driver_id::text,
        is_active = false
    where id = request_row.driver_id;

    delete from public.driver_help_ai_consents where driver_id = request_row.driver_id;

    update public.driver_account_deletion_requests
    set status = 'completed', completed_at = p_now, updated_at = p_now
    where id = request_row.id;
    completed_count := completed_count + 1;
  end loop;
  return completed_count;
end;
$$;

revoke all on function public.process_due_driver_account_deletions(timestamptz) from public;
grant execute on function public.process_due_driver_account_deletions(timestamptz) to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260816231000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
