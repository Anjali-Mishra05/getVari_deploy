-- Adds the two columns the app has been writing since "added all notifications
-- and edge cases" (607c5be) but that were never created on the table.
--
-- Without them PostgREST rejects every insert into getvari_hydration_logs with
-- PGRST204 / 42703, which is what stopped water being logged from the chat,
-- the quick-log station and the "+" sheet alike.
--
--   reported_at         when the user says they actually drank it (backdating)
--   verification_source whether the entry was user-reported or sensor-verified

alter table public.getvari_hydration_logs
  add column if not exists reported_at timestamptz,
  add column if not exists verification_source text not null default 'user-reported';

-- Existing rows predate backdating: the write time is the best intake time we
-- have for them, and it is what the client already falls back to on read.
update public.getvari_hydration_logs
   set reported_at = "timestamp"
 where reported_at is null;

alter table public.getvari_hydration_logs
  alter column reported_at set default now();

-- "Has the user drunk anything in the last 3 hours?" reads by intake time.
create index if not exists getvari_hydration_logs_user_reported_idx
  on public.getvari_hydration_logs (user_id, reported_at desc);
