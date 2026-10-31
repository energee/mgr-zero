-- Keep finished history out of current batch reads, including their exact counts.
-- The existing packaging_runs_open_idx already serves unfinished packaging work.
create index batches_unfinished_planned_idx
  on public.batches (brewery_id, planned_on desc, id)
  where closed_at is null and cancelled_at is null;

-- Each history predicate has its own newest-first keyset access path.
create index batches_completed_history_idx
  on public.batches (brewery_id, created_at desc, id desc)
  where closed_at is not null and cancelled_at is null;

create index batches_cancelled_history_idx
  on public.batches (brewery_id, created_at desc, id desc)
  where cancelled_at is not null;

create index packaging_runs_finished_history_idx
  on public.packaging_runs (brewery_id, created_at desc, id desc)
  where closed_at is not null or cancelled_at is not null;
