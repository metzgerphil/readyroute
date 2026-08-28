begin;

-- Answer Memory is shared across ReadyRoute companies, but it stores only
-- irreversible lexical fingerprints for paraphrase matching. Raw driver
-- wording remains subject to the interaction-retention policy.
alter table public.driver_help_answer_memory
  add column if not exists semantic_fingerprint text[] not null default '{}'::text[],
  add column if not exists semantic_reuse_count integer not null default 0;

alter table public.driver_help_answer_memory
  drop constraint if exists driver_help_answer_memory_semantic_reuse_count_check;
alter table public.driver_help_answer_memory
  add constraint driver_help_answer_memory_semantic_reuse_count_check
  check (semantic_reuse_count >= 0 and semantic_reuse_count <= reuse_count);

create index if not exists driver_help_answer_memory_semantic_fingerprint_idx
  on public.driver_help_answer_memory using gin (semantic_fingerprint);

create or replace function public.set_driver_help_answer_memory_fingerprint(
  p_route_key text,
  p_semantic_fingerprint text[]
) returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_help_answer_memory
  set semantic_fingerprint = coalesce(p_semantic_fingerprint, '{}'::text[]),
      updated_at = now()
  where route_key = p_route_key;
$$;

create or replace function public.record_driver_help_answer_memory_semantic_reuse(
  p_route_key text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_help_answer_memory
  set reuse_count = reuse_count + 1,
      semantic_reuse_count = semantic_reuse_count + 1,
      last_used_at = now(),
      updated_at = now()
  where route_key = p_route_key and status = 'ACTIVE';
$$;

revoke all on function public.set_driver_help_answer_memory_fingerprint(text, text[]) from public;
revoke all on function public.record_driver_help_answer_memory_semantic_reuse(text) from public;
grant execute on function public.set_driver_help_answer_memory_fingerprint(text, text[]) to service_role;
grant execute on function public.record_driver_help_answer_memory_semantic_reuse(text) to service_role;

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
    'grounded_ai_answers', count(*) filter (where interpretation_mode = 'GROUNDED_AI'),
    'learned_answers', count(*) filter (where interpretation_mode = 'LEARNED_ROUTE'),
    'semantic_learned_answers', count(*) filter (
      where interpretation_mode = 'LEARNED_ROUTE'
        and interpretation_result ->> 'memory_match_type' = 'SEMANTIC'
    ),
    'deterministic_answers', count(*) filter (where interpretation_mode = 'DETERMINISTIC'),
    'ai_calls', count(*) filter (
      where coalesce(nullif(interpretation_result #>> '{usage,total_tokens}', '')::numeric, 0) > 0
    ),
    'ai_calls_avoided', count(*) filter (
      where interpretation_mode = 'LEARNED_ROUTE'
        and interpretation_result ->> 'ai_bypassed' = 'true'
    ),
    'estimated_ai_cost_usd', round(coalesce(sum(
      coalesce(nullif(interpretation_result #>> '{usage,estimated_cost_usd}', '')::numeric, 0)
    ), 0), 6),
    'average_response_latency_ms', round(avg(response_latency_ms)
      filter (where response_latency_ms is not null)),
    'p95_response_latency_ms', round((percentile_cont(0.95) within group (order by response_latency_ms)
      filter (where response_latency_ms is not null))::numeric),
    'average_ai_response_latency_ms', round(avg(response_latency_ms)
      filter (where response_latency_ms is not null and interpretation_mode = 'GROUNDED_AI')),
    'average_learned_response_latency_ms', round(avg(response_latency_ms)
      filter (where response_latency_ms is not null and interpretation_mode = 'LEARNED_ROUTE'))
  )
  from public.driver_help_interactions
  where created_at >= p_since;
$$;

revoke all on function public.get_driver_help_global_metrics(timestamptz) from public;
grant execute on function public.get_driver_help_global_metrics(timestamptz) to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260827220000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
