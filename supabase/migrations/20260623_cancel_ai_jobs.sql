alter table analysis_jobs drop constraint if exists analysis_jobs_status_check;
alter table analysis_jobs add constraint analysis_jobs_status_check check (status in ('queued', 'processing', 'merging', 'completed', 'capacity_exhausted', 'failed', 'cancelled'));

alter table analysis_chunks drop constraint if exists analysis_chunks_status_check;
alter table analysis_chunks add constraint analysis_chunks_status_check check (status in ('queued', 'processing', 'completed', 'capacity_exhausted', 'failed', 'cancelled'));
