create table if not exists public.driver_help_knowledge_sources (
  source_id text primary key,
  title text not null,
  source_type text,
  source_date_or_version text,
  internal_location text,
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_help_knowledge_records (
  knowledge_id text not null,
  version integer not null default 1,
  status text not null,
  is_published boolean not null default false,
  canonical_situation text not null,
  normalized_description text,
  taxonomy_paths text[] not null default '{}'::text[],
  applicability jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  authoritative_rule text not null,
  required_procedure jsonb not null default '[]'::jsonb,
  required_documentation jsonb not null default '[]'::jsonb,
  prohibited_actions jsonb not null default '[]'::jsonb,
  escalation_requirements jsonb not null default '[]'::jsonb,
  clarification_requirements jsonb not null default '[]'::jsonb,
  related_knowledge_ids text[] not null default '{}'::text[],
  driver_question_variants text[] not null default '{}'::text[],
  driver_question_patterns jsonb not null default '[]'::jsonb,
  concise_answer text not null,
  more_info_answer text,
  source_date_or_version text,
  production_capture_gate text not null,
  production_trace_gate text not null,
  publication_blockers jsonb not null default '[]'::jsonb,
  record_checksum text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (knowledge_id, version),
  constraint driver_help_knowledge_status_check check (
    status in ('VERIFIED', 'UNRESOLVED', 'CONFLICT', 'POTENTIALLY_OUTDATED', 'HUMAN_REVIEW_REQUIRED')
  ),
  constraint driver_help_knowledge_publish_check check (
    is_published = false or status = 'VERIFIED'
  ),
  constraint driver_help_knowledge_version_check check (version > 0)
);

create table if not exists public.driver_help_knowledge_record_sources (
  knowledge_id text not null,
  knowledge_version integer not null,
  source_id text not null references public.driver_help_knowledge_sources(source_id) on delete restrict,
  locator text not null,
  evidence_note text,
  created_at timestamptz not null default now(),
  primary key (knowledge_id, knowledge_version, source_id, locator),
  foreign key (knowledge_id, knowledge_version)
    references public.driver_help_knowledge_records(knowledge_id, version) on delete cascade
);

create table if not exists public.driver_help_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  actor_type text not null,
  actor_id uuid not null,
  status text not null default 'active',
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_interaction_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint driver_help_session_status_check check (status in ('active', 'ended')),
  constraint driver_help_session_actor_check check (
    (actor_type = 'driver' and driver_id = actor_id) or
    (actor_type = 'manager' and driver_id is null)
  )
);

create table if not exists public.driver_help_interactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.driver_help_sessions(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  actor_type text not null,
  actor_id uuid not null,
  question text not null,
  normalized_question text not null,
  response_mode text not null,
  selected_knowledge_ids text[] not null default '{}'::text[],
  selected_knowledge_versions integer[] not null default '{}'::integer[],
  retrieval_candidates jsonb not null default '[]'::jsonb,
  confidence numeric(6, 5),
  answer_snapshot text,
  more_info_snapshot text,
  clarification_options jsonb not null default '[]'::jsonb,
  escalation_message text,
  created_at timestamptz not null default now(),
  constraint driver_help_interaction_mode_check check (response_mode in ('ANSWER', 'CLARIFY', 'ESCALATE')),
  constraint driver_help_interaction_question_check check (char_length(question) between 2 and 500),
  constraint driver_help_interaction_actor_check check (
    (actor_type = 'driver' and driver_id = actor_id) or
    (actor_type = 'manager' and driver_id is null)
  )
);

create table if not exists public.driver_help_feedback (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.driver_help_interactions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  actor_type text not null,
  actor_id uuid not null,
  rating text not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_help_feedback_rating_check check (rating in ('up', 'down')),
  constraint driver_help_feedback_comment_check check (comment is null or char_length(comment) <= 1000),
  constraint driver_help_feedback_actor_check check (
    (actor_type = 'driver' and driver_id = actor_id) or
    (actor_type = 'manager' and driver_id is null)
  ),
  unique (interaction_id, actor_type, actor_id)
);

create table if not exists public.driver_help_unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null unique references public.driver_help_interactions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  actor_type text not null,
  actor_id uuid not null,
  question text not null,
  normalized_question text not null,
  status text not null default 'open',
  resolution_note text,
  resolved_knowledge_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint driver_help_unanswered_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint driver_help_unanswered_actor_check check (
    (actor_type = 'driver' and driver_id = actor_id) or
    (actor_type = 'manager' and driver_id is null)
  )
);

create index if not exists driver_help_knowledge_published_idx
  on public.driver_help_knowledge_records (is_published, status, knowledge_id, version desc);
create index if not exists driver_help_sessions_driver_idx
  on public.driver_help_sessions (account_id, driver_id, last_interaction_at desc);
create index if not exists driver_help_sessions_actor_idx
  on public.driver_help_sessions (account_id, actor_type, actor_id, last_interaction_at desc);
create index if not exists driver_help_interactions_account_created_idx
  on public.driver_help_interactions (account_id, created_at desc);
create index if not exists driver_help_interactions_driver_created_idx
  on public.driver_help_interactions (driver_id, created_at desc);
create index if not exists driver_help_feedback_account_created_idx
  on public.driver_help_feedback (account_id, created_at desc);
create index if not exists driver_help_unanswered_account_status_idx
  on public.driver_help_unanswered_questions (account_id, status, created_at desc);

alter table public.driver_help_knowledge_sources enable row level security;
alter table public.driver_help_knowledge_records enable row level security;
alter table public.driver_help_knowledge_record_sources enable row level security;
alter table public.driver_help_sessions enable row level security;
alter table public.driver_help_interactions enable row level security;
alter table public.driver_help_feedback enable row level security;
alter table public.driver_help_unanswered_questions enable row level security;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260809010000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
