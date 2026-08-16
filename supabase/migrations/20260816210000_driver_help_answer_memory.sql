begin;

create table if not exists public.driver_help_answer_memory (
  route_key text primary key,
  normalized_question text not null unique,
  knowledge_id text not null,
  knowledge_version integer not null,
  response_mode text not null,
  answer_pattern_id text,
  clarification_requirement text,
  interpreted_facts jsonb not null default '{}'::jsonb,
  risk_tier text not null default 'STANDARD',
  status text not null default 'CANDIDATE',
  agreement_count integer not null default 1,
  disagreement_count integer not null default 0,
  reuse_count integer not null default 0,
  negative_feedback_count integer not null default 0,
  highest_confidence numeric(6, 5),
  activated_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (knowledge_id, knowledge_version)
    references public.driver_help_knowledge_records(knowledge_id, version) on delete cascade,
  constraint driver_help_answer_memory_mode_check check (response_mode in ('ANSWER', 'CLARIFY')),
  constraint driver_help_answer_memory_risk_check check (risk_tier in ('STANDARD', 'HIGH')),
  constraint driver_help_answer_memory_status_check check (
    status in ('CANDIDATE', 'ACTIVE', 'REVIEW_REQUIRED', 'SUSPENDED')
  ),
  constraint driver_help_answer_memory_counts_check check (
    agreement_count >= 0 and disagreement_count >= 0 and reuse_count >= 0 and negative_feedback_count >= 0
  )
);

create index if not exists driver_help_answer_memory_status_idx
  on public.driver_help_answer_memory (status, risk_tier, last_seen_at desc);
create index if not exists driver_help_answer_memory_knowledge_idx
  on public.driver_help_answer_memory (knowledge_id, knowledge_version, status);

alter table public.driver_help_answer_memory enable row level security;
grant all privileges on table public.driver_help_answer_memory to service_role;

create or replace function public.observe_driver_help_answer_memory(
  p_route_key text,
  p_normalized_question text,
  p_knowledge_id text,
  p_knowledge_version integer,
  p_response_mode text,
  p_answer_pattern_id text,
  p_clarification_requirement text,
  p_interpreted_facts jsonb,
  p_risk_tier text,
  p_confidence numeric
) returns public.driver_help_answer_memory
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.driver_help_answer_memory;
  agreeing boolean;
begin
  select * into current_row
  from public.driver_help_answer_memory
  where route_key = p_route_key
  for update;

  if not found then
    insert into public.driver_help_answer_memory (
      route_key, normalized_question, knowledge_id, knowledge_version, response_mode,
      answer_pattern_id, clarification_requirement, interpreted_facts, risk_tier,
      status, agreement_count, highest_confidence
    ) values (
      p_route_key, p_normalized_question, p_knowledge_id, p_knowledge_version, p_response_mode,
      p_answer_pattern_id, p_clarification_requirement, coalesce(p_interpreted_facts, '{}'::jsonb),
      p_risk_tier, case when p_risk_tier = 'HIGH' then 'REVIEW_REQUIRED' else 'CANDIDATE' end,
      1, p_confidence
    ) returning * into current_row;
    return current_row;
  end if;

  agreeing := current_row.knowledge_id = p_knowledge_id
    and current_row.knowledge_version = p_knowledge_version
    and current_row.response_mode = p_response_mode
    and coalesce(current_row.answer_pattern_id, '') = coalesce(p_answer_pattern_id, '')
    and coalesce(current_row.clarification_requirement, '') = coalesce(p_clarification_requirement, '');

  if agreeing then
    update public.driver_help_answer_memory
    set agreement_count = agreement_count + 1,
        interpreted_facts = coalesce(p_interpreted_facts, interpreted_facts),
        highest_confidence = greatest(coalesce(highest_confidence, 0), coalesce(p_confidence, 0)),
        status = case
          when status = 'SUSPENDED' then status
          when risk_tier = 'HIGH' then 'REVIEW_REQUIRED'
          when agreement_count + 1 >= 2 and negative_feedback_count = 0 then 'ACTIVE'
          else status
        end,
        activated_at = case
          when risk_tier = 'STANDARD' and agreement_count + 1 >= 2
            and negative_feedback_count = 0 then coalesce(activated_at, now())
          else activated_at
        end,
        last_seen_at = now(),
        updated_at = now()
    where route_key = p_route_key
    returning * into current_row;
  else
    update public.driver_help_answer_memory
    set disagreement_count = disagreement_count + 1,
        status = 'SUSPENDED',
        last_seen_at = now(),
        updated_at = now()
    where route_key = p_route_key
    returning * into current_row;
  end if;

  return current_row;
end;
$$;

create or replace function public.record_driver_help_answer_memory_reuse(p_route_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_help_answer_memory
  set reuse_count = reuse_count + 1,
      last_used_at = now(),
      updated_at = now()
  where route_key = p_route_key and status = 'ACTIVE';
$$;

create or replace function public.suspend_driver_help_answer_memory(
  p_route_key text,
  p_knowledge_id text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_help_answer_memory
  set negative_feedback_count = negative_feedback_count + 1,
      status = 'SUSPENDED',
      updated_at = now()
  where route_key = p_route_key
    and knowledge_id = p_knowledge_id;
$$;

create or replace function public.review_driver_help_answer_memory(
  p_route_key text,
  p_action text,
  p_reviewed_by uuid
) returns public.driver_help_answer_memory
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewed_row public.driver_help_answer_memory;
begin
  if p_action not in ('APPROVE', 'SUSPEND') then
    raise exception 'Unsupported answer-memory review action';
  end if;

  update public.driver_help_answer_memory
  set status = case when p_action = 'APPROVE' then 'ACTIVE' else 'SUSPENDED' end,
      activated_at = case when p_action = 'APPROVE' then coalesce(activated_at, now()) else activated_at end,
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      updated_at = now()
  where route_key = p_route_key
  returning * into reviewed_row;

  return reviewed_row;
end;
$$;

revoke all on function public.observe_driver_help_answer_memory(text, text, text, integer, text, text, text, jsonb, text, numeric) from public;
revoke all on function public.record_driver_help_answer_memory_reuse(text) from public;
revoke all on function public.suspend_driver_help_answer_memory(text, text) from public;
revoke all on function public.review_driver_help_answer_memory(text, text, uuid) from public;
grant execute on function public.observe_driver_help_answer_memory(text, text, text, integer, text, text, text, jsonb, text, numeric) to service_role;
grant execute on function public.record_driver_help_answer_memory_reuse(text) to service_role;
grant execute on function public.suspend_driver_help_answer_memory(text, text) to service_role;
grant execute on function public.review_driver_help_answer_memory(text, text, uuid) to service_role;

alter table public.driver_help_interactions
  drop constraint if exists driver_help_interpretation_mode_check;
alter table public.driver_help_interactions
  add constraint driver_help_interpretation_mode_check check (
    interpretation_mode in (
      'DETERMINISTIC', 'DETERMINISTIC_FALLBACK', 'CONTROLLED_FALLBACK',
      'GROUNDED_AI', 'AI_SHADOW', 'AI_SHADOW_FALLBACK', 'LEARNED_ROUTE'
    )
  );

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260816210000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
