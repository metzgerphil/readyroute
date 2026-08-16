begin;

create or replace function public.driver_help_answer_memory_required_agreements(
  p_risk_tier text,
  p_response_mode text
) returns integer
language sql
immutable
as $$
  select case
    when p_risk_tier = 'HIGH' then 5
    when p_response_mode = 'CLARIFY' then 5
    else 3
  end;
$$;

update public.driver_help_answer_memory
set status = case when risk_tier = 'HIGH' then 'REVIEW_REQUIRED' else 'CANDIDATE' end,
    activated_at = null,
    updated_at = now()
where status = 'ACTIVE'
  and agreement_count < public.driver_help_answer_memory_required_agreements(risk_tier, response_mode);

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
  required_agreements integer;
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
    required_agreements := public.driver_help_answer_memory_required_agreements(
      current_row.risk_tier,
      current_row.response_mode
    );
    update public.driver_help_answer_memory
    set agreement_count = agreement_count + 1,
        interpreted_facts = coalesce(p_interpreted_facts, interpreted_facts),
        highest_confidence = greatest(coalesce(highest_confidence, 0), coalesce(p_confidence, 0)),
        status = case
          when status = 'SUSPENDED' then status
          when risk_tier = 'HIGH' and reviewed_at is null then 'REVIEW_REQUIRED'
          when agreement_count + 1 >= required_agreements and negative_feedback_count = 0 then 'ACTIVE'
          when risk_tier = 'HIGH' then 'REVIEW_REQUIRED'
          else 'CANDIDATE'
        end,
        activated_at = case
          when agreement_count + 1 >= required_agreements
            and negative_feedback_count = 0
            and (risk_tier <> 'HIGH' or reviewed_at is not null)
            then coalesce(activated_at, now())
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
  required_agreements integer;
begin
  if p_action not in ('APPROVE', 'SUSPEND') then
    raise exception 'Unsupported answer-memory review action';
  end if;

  select * into reviewed_row
  from public.driver_help_answer_memory
  where route_key = p_route_key
  for update;

  if not found then
    return null;
  end if;

  required_agreements := public.driver_help_answer_memory_required_agreements(
    reviewed_row.risk_tier,
    reviewed_row.response_mode
  );
  if p_action = 'APPROVE' and reviewed_row.agreement_count < required_agreements then
    raise exception 'This answer-memory route needs % matching AI confirmations before approval', required_agreements;
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

revoke all on function public.driver_help_answer_memory_required_agreements(text, text) from public;
grant execute on function public.driver_help_answer_memory_required_agreements(text, text) to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260816220000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
