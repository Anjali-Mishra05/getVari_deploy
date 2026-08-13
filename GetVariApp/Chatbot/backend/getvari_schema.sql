-- ============================================================================
-- getVāri — storage for user profiles and hydration entries
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor for project ntuboicvzsoamwedtprg:
--   https://supabase.com/dashboard/project/ntuboicvzsoamwedtprg/sql/new
--
-- It is safe to re-run: every statement is either `if not exists` or an
-- idempotent repair of whatever already exists.
--
-- Why `text` and not `uuid` for the owner column:
-- the app has a demo/offline sign-in path that mints a stable device-local id
-- instead of a real auth.users row. A `uuid` column with a foreign key to
-- auth.users rejects those writes ("invalid input syntax for type uuid" /
-- foreign key violation), which is what silently swallowed every chat log.
-- `text` accepts both a real auth uid and the demo id.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.getvari_profiles (
  id          text primary key,
  profile     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.getvari_hydration_logs (
  id          text primary key,   -- 'hyd_<user_id>_<request_id>' — see below
  user_id     text        not null,
  "timestamp" timestamptz not null default now(),
  amount_ml   integer     not null,
  source      text        not null default 'manual',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Repair pre-existing tables that were created with the older shape
-- ---------------------------------------------------------------------------

-- 2a. Drop foreign keys to auth.users; the demo id has no auth.users row.
do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'f'
      and conrelid in (
        'public.getvari_profiles'::regclass,
        'public.getvari_hydration_logs'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- 2b. Widen the id/owner columns to text (a no-op when they already are).
alter table public.getvari_profiles
  alter column id type text using id::text;

alter table public.getvari_hydration_logs
  alter column id      type text using id::text,
  alter column user_id type text using user_id::text;

-- 2c. Add anything an older revision of the table is missing.
alter table public.getvari_profiles
  add column if not exists profile    jsonb       not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.getvari_hydration_logs
  add column if not exists source     text        not null default 'manual',
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 3. Idempotency
-- ---------------------------------------------------------------------------
-- The app never invents a row id from the clock. Every write carries a request
-- id — the reminder's event id for notification-driven logs, the chat message
-- id for typed ones — and the row id is derived from it:
--
--     id = 'hyd_' || user_id || '_' || request_id
--
-- A UNIQUE id therefore makes duplicates physically impossible: a replayed
-- notification, a retried request or a double tap hits error 23505 and the
-- client reports "already logged" instead of inserting a second entry.

-- Collapse duplicates left over from before this guarantee existed, so the
-- unique index below can be built (keeps the earliest row of each id).
delete from public.getvari_hydration_logs a
using public.getvari_hydration_logs b
where a.id = b.id
  and a.ctid > b.ctid;

create unique index if not exists getvari_hydration_logs_id_key
  on public.getvari_hydration_logs (id);

-- Supports the "today's intake" read the app runs after every write.
create index if not exists getvari_hydration_logs_user_ts_idx
  on public.getvari_hydration_logs (user_id, "timestamp" desc);

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
-- Signed-in users (auth.uid() present) can only touch their own rows.
-- The demo / device-id path runs as `anon` with no auth.uid(); it is allowed
-- through so the investor demo keeps working.
--
-- >>> Before going to production, delete the `auth.uid() is null or` clauses
-- >>> below and drop the demo sign-in path in AuthService.ts.

alter table public.getvari_profiles        enable row level security;
alter table public.getvari_hydration_logs  enable row level security;

drop policy if exists getvari_profiles_owner_rw on public.getvari_profiles;
create policy getvari_profiles_owner_rw
  on public.getvari_profiles
  for all
  to anon, authenticated
  using      (auth.uid() is null or auth.uid()::text = id)
  with check (auth.uid() is null or auth.uid()::text = id);

drop policy if exists getvari_hydration_logs_owner_rw on public.getvari_hydration_logs;
create policy getvari_hydration_logs_owner_rw
  on public.getvari_hydration_logs
  for all
  to anon, authenticated
  using      (auth.uid() is null or auth.uid()::text = user_id)
  with check (auth.uid() is null or auth.uid()::text = user_id);

-- ---------------------------------------------------------------------------
-- 5. Grants (Supabase normally applies these by default; explicit is safer)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.getvari_profiles       to anon, authenticated;
grant select, insert, update, delete on public.getvari_hydration_logs to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- 6. Verify — should return the two tables with rls enabled
-- ---------------------------------------------------------------------------
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('getvari_profiles', 'getvari_hydration_logs');
