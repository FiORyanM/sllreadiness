create table if not exists credit_strategy_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  source_job_id uuid not null references analysis_jobs(id) on delete cascade,
  cache_key text not null,
  job_token_hash text not null,
  input jsonb not null,
  framework_version text not null,
  market_version text not null,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  stage text not null,
  result jsonb,
  error text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_strategy_cache_idx
  on credit_strategy_analysis_jobs (cache_key, expires_at desc)
  where status = 'completed';

create index if not exists credit_strategy_status_idx
  on credit_strategy_analysis_jobs (status, updated_at);

alter table credit_strategy_analysis_jobs enable row level security;
