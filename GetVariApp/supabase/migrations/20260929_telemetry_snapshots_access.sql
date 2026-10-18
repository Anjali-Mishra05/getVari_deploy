-- Lets the app store its daily telemetry snapshots.
--
-- The phone writes through the publishable key as `anon` (Firebase / demo
-- sign-in, no Supabase auth session), exactly as it does for
-- getvari_profiles and getvari_hydration_logs. Those two tables are granted
-- to anon with the demo-friendly owner policy in
-- Chatbot/backend/getvari_schema.sql; getvari_telemetry_snapshots never was,
-- so every upsert from TelemetryHistoryService.recordSnapshot failed with
-- 42501 "permission denied for table getvari_telemetry_snapshots" — silently,
-- because the client did not check the error. The table has held a single row
-- (2026-09-03) since.
--
-- Nothing here deletes or rewrites existing rows.

begin;

-- One row per user per day: the target of the app's upsert
-- (`onConflict: 'user_id,date'`), so a day's snapshot is updated in place
-- instead of a new row being added on every reading.
create unique index if not exists getvari_telemetry_snapshots_user_date_key
  on public.getvari_telemetry_snapshots (user_id, date);

alter table public.getvari_telemetry_snapshots enable row level security;

-- Same rule as getvari_hydration_logs: a signed-in user touches only their own
-- rows; the demo / device-id path (anon, no auth.uid()) is let through.
-- >>> Before production, drop the `auth.uid() is null or` clauses together
-- >>> with the ones on the other two tables.
drop policy if exists getvari_telemetry_snapshots_owner_rw on public.getvari_telemetry_snapshots;
create policy getvari_telemetry_snapshots_owner_rw
  on public.getvari_telemetry_snapshots
  for all
  to anon, authenticated
  using      (auth.uid() is null or auth.uid()::text = user_id::text)
  with check (auth.uid() is null or auth.uid()::text = user_id::text);

-- The admin panel (signed in through Supabase auth) reads every user's
-- snapshots, as it already does for profiles and logs (supabase/admin_setup.sql).
drop policy if exists "Admins can view all telemetry" on public.getvari_telemetry_snapshots;
create policy "Admins can view all telemetry"
  on public.getvari_telemetry_snapshots for select
  to authenticated
  using (public.is_admin() or auth.uid()::text = user_id::text);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.getvari_telemetry_snapshots to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verify (read-only). Expect SELECT, INSERT, UPDATE for anon and authenticated;
-- the two policies; and the (user_id, date) unique index.
-- ---------------------------------------------------------------------------
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'getvari_telemetry_snapshots'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type;

select policyname, roles, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'getvari_telemetry_snapshots';

select indexname
  from pg_indexes
 where schemaname = 'public' and tablename = 'getvari_telemetry_snapshots';
