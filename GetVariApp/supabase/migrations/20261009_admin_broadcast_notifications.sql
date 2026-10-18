-- Admin notifications: secure the alerts table, and add the two server-side
-- entry points the admin panel and the app use.
--
-- FOR REVIEW. Nothing here has been applied. Read "BEFORE YOU RUN THIS" first.
--
-- Reviewed against the live schema (2026-10-09):
--   getvari_admin_alerts: id uuid, user_id text, severity text, status text
--   getvari_profiles:     id text
--   policies on getvari_admin_alerts:
--     "Admins can manage alerts"                    authenticated  ALL     is_admin()
--     "Authenticated users can create admin alerts" authenticated  INSERT  true   <- dropped here
--     "Authenticated users can read admin alerts"   authenticated  SELECT  true   <- dropped here
--
-- What it changes
-- ---------------
-- 1. `is_admin()` trusts `app_metadata.is_admin`, not `user_metadata`.
--    `user_metadata` can be edited by the signed-in account itself, so any
--    account could mark itself an admin. `app_metadata` can only be set from
--    the Supabase dashboard / service role. Every admin policy calls this
--    function, so they all tighten at once.
--
-- 2. `getvari_admin_alerts` is closed to everyone but admins: the two open
--    policies are dropped and anon is given no access to the table.
--
-- 3. `severity` also allows 'info' (Notify All Users, and Send Alert to a user
--    who is not Critical). Existing rows are untouched.
--
-- 4. `getvari_admin_notify_all(title, message)` — "Notify All Users". Checks
--    `is_admin()` on the server, then writes one row for every row in
--    getvari_profiles in one statement. Returns the number of users.
--
-- 5. `getvari_my_admin_messages(user_id, since)` — how the phone collects its
--    messages.
--
--    >>> KNOWN LIMIT, NOT A SECURE BOUNDARY. The phone has no Supabase
--    >>> identity (it uses the publishable key as `anon`), so this function
--    >>> cannot tell who is calling: it returns the last 24 hours of messages
--    >>> for whatever user id it is given. Profile ids are random, but
--    >>> getvari_profiles is itself readable by anon, so they can be listed.
--    >>> Anyone holding the publishable key can therefore read another user's
--    >>> admin messages — including that a user was sent a Critical alert.
--    >>> No SQL here can close that; it needs the app to sign in to Supabase
--    >>> (see the secure variant at the end of this file).
--
-- Nothing here deletes or rewrites existing rows. Safe to run more than once.
--
-- BEFORE YOU RUN THIS
-- -------------------
-- Give the real admin account the trusted flag. Without it the admin panel
-- loses access the moment `is_admin()` changes — so this migration refuses to
-- run until at least one account has it. Run once, with the admin's email:
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
--    where email = '<ADMIN EMAIL HERE>';
--
-- After the migration, sign out of the admin panel and back in: the session
-- you are holding was issued before the flag existed.

begin;

-- ---------------------------------------------------------------------------
-- 0. Lock-out guard: stop here unless a trusted admin exists
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from auth.users
     where coalesce(raw_app_meta_data ->> 'is_admin', 'false') = 'true'
  ) then
    raise exception
      'No account has app_metadata.is_admin = true. Set it first (see BEFORE YOU RUN THIS); nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Trusted admin check
-- ---------------------------------------------------------------------------
-- Compared as text, so a malformed value reads as "not an admin" instead of
-- raising inside every policy that calls this.
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', 'false') = 'true';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The alerts table: severity, and who may touch it
-- ---------------------------------------------------------------------------

-- Replace the severity rule whatever it was named. `status` keeps its own
-- rule ('sent' | 'failed'), which every write here satisfies.
do $$
declare
  rule record;
begin
  for rule in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.getvari_admin_alerts'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%severity%'
  loop
    execute format('alter table public.getvari_admin_alerts drop constraint %I', rule.conname);
  end loop;
end $$;
alter table public.getvari_admin_alerts
  add constraint getvari_admin_alerts_severity_check
  check (severity in ('critical', 'info'));

alter table public.getvari_admin_alerts enable row level security;

drop policy if exists "Authenticated users can read admin alerts"   on public.getvari_admin_alerts;
drop policy if exists "Authenticated users can create admin alerts" on public.getvari_admin_alerts;
drop policy if exists "App can read admin alerts"                   on public.getvari_admin_alerts;

drop policy if exists "Admins can manage alerts" on public.getvari_admin_alerts;
create policy "Admins can manage alerts"
  on public.getvari_admin_alerts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.getvari_admin_alerts from public, anon;
grant select, insert, update, delete on public.getvari_admin_alerts to authenticated;

create index if not exists getvari_admin_alerts_user_sent_idx
  on public.getvari_admin_alerts (user_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- 3. Notify All Users (admin only, checked here on the server)
-- ---------------------------------------------------------------------------
create or replace function public.getvari_admin_notify_all(p_title text, p_message text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title   text := btrim(coalesce(p_title, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_count   integer;
begin
  if not public.is_admin() then
    raise exception 'Permission denied: administrator privileges are required.' using errcode = '42501';
  end if;
  if v_title = '' or v_message = '' then
    raise exception 'A title and a message are both required.' using errcode = '22023';
  end if;
  if length(v_title) > 60 or length(v_message) > 200 then
    raise exception 'The title (60) or the message (200) is too long.' using errcode = '22001';
  end if;

  -- The same message again within a minute is a double press or a retry of a
  -- request that had in fact gone through, not a second message.
  if exists (
    select 1 from public.getvari_admin_alerts
     where severity = 'info' and title = v_title and message = v_message
       and sent_at > now() - interval '60 seconds'
  ) then
    raise exception 'This notification was already sent a moment ago.' using errcode = '23505';
  end if;

  -- Every registered user: no filter on status, risk or intake.
  insert into public.getvari_admin_alerts (user_id, severity, title, message, status, sent_at)
  select p.id, 'info', v_title, v_message, 'sent', now()
    from public.getvari_profiles p;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'There are no registered users to notify.' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke all on function public.getvari_admin_notify_all(text, text) from public, anon;
grant execute on function public.getvari_admin_notify_all(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The phone's read — see KNOWN LIMIT in the header before granting this
-- ---------------------------------------------------------------------------
create or replace function public.getvari_my_admin_messages(p_user_id text, p_since timestamptz)
returns table (id uuid, severity text, title text, message text, sent_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.severity, a.title, a.message, a.sent_at
    from public.getvari_admin_alerts a
   where p_user_id is not null
     and a.user_id = p_user_id
     and a.status = 'sent'
     and a.sent_at >= greatest(coalesce(p_since, now() - interval '24 hours'), now() - interval '24 hours')
   order by a.sent_at asc
   limit 50;
$$;

revoke all on function public.getvari_my_admin_messages(text, timestamptz) from public;
-- The line that accepts the known limit. Leave it out to apply every fix above
-- with no delivery to phones until the app signs in to Supabase.
grant execute on function public.getvari_my_admin_messages(text, timestamptz) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verify (read-only). Expect: one policy ("Admins can manage alerts"); no anon
-- rows in the grants; and the three functions.
-- ---------------------------------------------------------------------------
select policyname, roles, cmd, qual, with_check
  from pg_policies where tablename = 'getvari_admin_alerts';

select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'getvari_admin_alerts'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type;

select proname from pg_proc
 where proname in ('is_admin', 'getvari_admin_notify_all', 'getvari_my_admin_messages');

-- ---------------------------------------------------------------------------
-- ROLLBACK (not run). Restores the admin check and the table rules to what
-- was live before this file. It also restores the weaknesses, so use it only
-- to get back in, then fix forward.
-- ---------------------------------------------------------------------------
-- begin;
-- create or replace function public.is_admin() returns boolean as $$
-- begin
--   return (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true;
-- end;
-- $$ language plpgsql security definer;
-- drop function if exists public.getvari_admin_notify_all(text, text);
-- drop function if exists public.getvari_my_admin_messages(text, timestamptz);
-- create policy "Authenticated users can read admin alerts"
--   on public.getvari_admin_alerts for select to authenticated using (true);
-- create policy "Authenticated users can create admin alerts"
--   on public.getvari_admin_alerts for insert to authenticated with check (true);
-- -- The severity rule can stay widened; narrowing it back fails if any 'info'
-- -- row has been written.
-- commit;

-- ---------------------------------------------------------------------------
-- SECURE VARIANT of the phone's read (not run; needs app sign-in first).
--
-- Once the app presents a verified identity to Supabase — for example
-- Supabase's third-party auth with the Firebase sign-in the app already uses —
-- the function takes no user id at all and answers only for the caller:
-- ---------------------------------------------------------------------------
-- create or replace function public.getvari_my_admin_messages(p_since timestamptz)
-- returns table (id uuid, severity text, title text, message text, sent_at timestamptz)
-- language sql stable security definer set search_path = public
-- as $$
--   select a.id, a.severity, a.title, a.message, a.sent_at
--     from public.getvari_admin_alerts a
--     join public.getvari_profiles p on p.id = a.user_id
--    where p.firebase_uid = auth.jwt() ->> 'sub'
--      and a.status = 'sent'
--      and a.sent_at >= greatest(coalesce(p_since, now() - interval '24 hours'), now() - interval '24 hours')
--    order by a.sent_at asc
--    limit 50;
-- $$;
-- revoke all on function public.getvari_my_admin_messages(timestamptz) from public, anon;
-- grant execute on function public.getvari_my_admin_messages(timestamptz) to authenticated;
