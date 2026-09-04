-- ============================================================================
-- getVāri — the admin-controlled runtime configuration document
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor, alongside getvari_schema.sql.
-- Safe to re-run.
--
-- One row, one JSON document. The mobile app reads it through the backend's
-- GET /config (which holds the service-role key); the admin console writes it
-- with the anon key under the policy below.
--
-- The whole config is a single row rather than a table per section because it
-- is read as a unit and has to be *consistent* as a unit: a client that picked
-- up a new condition list but the old target formula would compute goals no
-- one configured. One row means one version, and one atomic swap.
-- ============================================================================

begin;

create table if not exists public.getvari_app_config (
  id          text primary key default 'active',
  version     integer     not null default 1,
  config      jsonb       not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- Bump the version on every write, so a client can tell a stale cache from a
-- current one without diffing the document.
create or replace function public.getvari_app_config_bump()
returns trigger
language plpgsql
as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists getvari_app_config_bump on public.getvari_app_config;
create trigger getvari_app_config_bump
  before update on public.getvari_app_config
  for each row execute function public.getvari_app_config_bump();

alter table public.getvari_app_config enable row level security;

-- Readable by anyone (it contains no user data — only product settings), and
-- writable by the console. Tighten the write side to an admin claim once the
-- console moves off the anon key.
drop policy if exists getvari_app_config_read on public.getvari_app_config;
create policy getvari_app_config_read
  on public.getvari_app_config for select
  using (true);

drop policy if exists getvari_app_config_write on public.getvari_app_config;
create policy getvari_app_config_write
  on public.getvari_app_config for all
  using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.getvari_app_config to anon, authenticated;

-- Seed the single row if it is not there yet. An empty document is fine: the
-- backend merges it over its own defaults, so the app behaves exactly as it
-- did before anyone opened the admin console.
insert into public.getvari_app_config (id, config)
values ('active', '{}'::jsonb)
on conflict (id) do nothing;

commit;
