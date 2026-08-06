# Supabase Setup

Run `migrations/20260623_all_ai_jobs.sql` in the Supabase SQL Editor before deploying.
Then run `migrations/20260623_cancel_ai_jobs.sql` to enable user cancellation of queued or processing analysis jobs.
Run `migrations/20260715_sustainability_analysis_jobs.sql` to enable cached, on-demand sustainability portfolio analyses.
Run `migrations/20260729_credit_strategy_jobs.sql` to enable the focused evidence-mapping and Climate Capital & Carbon Credit Decision Brief queue.

The application uses `SUPABASE_SERVICE_ROLE_KEY` only on the server. Do not expose it in browser code or public environment settings.

The migration enables row-level security and relies on the service role for server-side job access. Jobs use a per-job bearer token, stored only as a SHA-256 hash in the database.
