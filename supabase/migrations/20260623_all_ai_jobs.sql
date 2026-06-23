create extension if not exists pgcrypto;

create table if not exists analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  report_hash text not null,
  metadata jsonb not null,
  status text not null check (status in ('queued', 'processing', 'merging', 'completed', 'capacity_exhausted', 'failed')),
  stage text not null,
  job_token_hash text not null,
  result jsonb,
  error text,
  merge_provider_cursor integer not null default 0,
  merge_retry_used boolean not null default false,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analysis_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references analysis_jobs(id) on delete cascade,
  position integer not null,
  text text not null,
  status text not null check (status in ('queued', 'processing', 'completed', 'capacity_exhausted', 'failed')) default 'queued',
  provider_cursor integer not null default 0,
  retry_used boolean not null default false,
  evidence jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, position)
);

create table if not exists provider_state (
  provider_name text primary key,
  available_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_jobs_hash_completed_idx on analysis_jobs (report_hash, expires_at desc) where status = 'completed';
create index if not exists analysis_chunks_job_status_idx on analysis_chunks (job_id, status, position);
create index if not exists analysis_jobs_status_idx on analysis_jobs (status, updated_at);

create or replace function reserve_provider_slot(p_provider text, p_requests_per_minute integer)
returns integer
language plpgsql
as $$
declare
  scheduled_at timestamptz;
  interval_seconds numeric;
begin
  if p_requests_per_minute <= 0 then
    raise exception 'requests_per_minute must be positive';
  end if;

  insert into provider_state (provider_name) values (p_provider)
  on conflict (provider_name) do nothing;

  select available_at into scheduled_at
  from provider_state
  where provider_name = p_provider
  for update;

  scheduled_at := greatest(scheduled_at, now());
  interval_seconds := 60.0 / p_requests_per_minute;

  update provider_state
  set available_at = scheduled_at + make_interval(secs => interval_seconds), updated_at = now()
  where provider_name = p_provider;

  return greatest(0, floor(extract(epoch from scheduled_at - now()) * 1000)::integer);
end;
$$;

alter table analysis_jobs enable row level security;
alter table analysis_chunks enable row level security;
alter table provider_state enable row level security;
