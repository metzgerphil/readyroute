begin;

-- Answer Memory remains an analytics surface for repeated wording and field
-- feedback. It is permanently prohibited from serving or selecting an answer.
alter table public.driver_help_answer_memory
  add column if not exists runtime_reuse_prohibited boolean not null default true;

alter table public.driver_help_answer_memory
  drop constraint if exists driver_help_answer_memory_runtime_reuse_prohibited_check;
alter table public.driver_help_answer_memory
  add constraint driver_help_answer_memory_runtime_reuse_prohibited_check
  check (runtime_reuse_prohibited = true);

comment on table public.driver_help_answer_memory is
  'Analytics-only wording patterns. Runtime answer selection and AI bypass are prohibited.';
comment on column public.driver_help_answer_memory.runtime_reuse_prohibited is
  'Permanent quality-first guard. This value must remain true.';

create or replace function public.record_driver_help_answer_memory_reuse(p_route_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Answer Memory runtime reuse is disabled by the ReadyRoute quality-first policy'
    using errcode = '55000';
end;
$$;

create or replace function public.record_driver_help_answer_memory_semantic_reuse(p_route_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Answer Memory semantic reuse is disabled by the ReadyRoute quality-first policy'
    using errcode = '55000';
end;
$$;

alter table public.driver_help_interactions
  drop constraint if exists driver_help_interpretation_mode_check;
alter table public.driver_help_interactions
  add constraint driver_help_interpretation_mode_check check (
    interpretation_mode in (
      'DETERMINISTIC', 'DETERMINISTIC_FALLBACK', 'CONTROLLED_FALLBACK',
      'GROUNDED_AI', 'VERIFIED_GROUNDED_AI', 'AI_FAIL_CLOSED',
      'AI_SHADOW', 'AI_SHADOW_FALLBACK', 'LEARNED_ROUTE'
    )
  );

create or replace function public.get_driver_help_global_metrics(
  p_since timestamptz
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'window_start', p_since,
    'total_questions', count(*),
    'companies', count(distinct account_id),
    'drivers', count(distinct driver_id) filter (where driver_id is not null),
    'answers', count(*) filter (where response_mode = 'ANSWER'),
    'clarifications', count(*) filter (where response_mode = 'CLARIFY'),
    'escalations', count(*) filter (where response_mode = 'ESCALATE'),
    'grounded_ai_answers', count(*) filter (
      where interpretation_mode in ('GROUNDED_AI', 'VERIFIED_GROUNDED_AI')
    ),
    'ai_interpretation_runs', count(*) filter (where interpretation_result ? 'ai'),
    'ai_interpretation_grounded', count(*) filter (
      where interpretation_result #>> '{ai,status}' = 'GROUNDED'
    ),
    'ai_interpretation_failures', count(*) filter (
      where interpretation_result ? 'ai'
        and interpretation_result #>> '{ai,status}' <> 'GROUNDED'
    ),
    'ai_interpretation_retries', count(*) filter (
      where interpretation_result #>> '{ai,retried}' = 'true'
    ),
    'ai_interpretation_calls', coalesce(sum(
      coalesce(nullif(interpretation_result #>> '{ai,call_count}', '')::integer, 0)
    ), 0),
    'ai_calls', coalesce(sum(
      coalesce(nullif(interpretation_result #>> '{ai,call_count}', '')::integer, 0)
    ), 0),
    'ai_calls_avoided', 0,
    'learned_answers', count(*) filter (where interpretation_mode = 'LEARNED_ROUTE'),
    'semantic_learned_answers', count(*) filter (
      where interpretation_mode = 'LEARNED_ROUTE'
        and interpretation_result #>> '{memory_match_type}' = 'SEMANTIC'
    ),
    'deterministic_answers', count(*) filter (where interpretation_mode = 'DETERMINISTIC'),
    'estimated_ai_cost_usd', round(coalesce(sum(
      coalesce(nullif(interpretation_result #>> '{usage,estimated_cost_usd}', '')::numeric, 0)
    ), 0), 6),
    'average_response_latency_ms', round(avg(response_latency_ms)
      filter (where response_latency_ms is not null)),
    'p95_response_latency_ms', round((percentile_cont(0.95) within group (order by response_latency_ms)
      filter (where response_latency_ms is not null))::numeric),
    'average_ai_response_latency_ms', round(avg(response_latency_ms)
      filter (where response_latency_ms is not null and interpretation_mode = 'GROUNDED_AI')),
    'average_learned_response_latency_ms', null
  )
  from public.driver_help_interactions
  where created_at >= p_since;
$$;

revoke all on function public.record_driver_help_answer_memory_reuse(text) from public;
revoke all on function public.record_driver_help_answer_memory_semantic_reuse(text) from public;
revoke all on function public.get_driver_help_global_metrics(timestamptz) from public;
grant execute on function public.record_driver_help_answer_memory_reuse(text) to service_role;
grant execute on function public.record_driver_help_answer_memory_semantic_reuse(text) to service_role;
grant execute on function public.get_driver_help_global_metrics(timestamptz) to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260901140000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
