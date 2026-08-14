-- ============================================================================
-- GetVari Admin Security & RBAC Configuration
-- ----------------------------------------------------------------------------
-- This script configures Row Level Security (RLS) to allow authenticated admins
-- to view fleet-wide data and send critical alerts.
-- ============================================================================

-- 1. Create or Repair the admin alerts table
-- We use 'text' for user_id to match the getvari_profiles.id type
create table if not exists public.getvari_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.getvari_profiles(id) on delete cascade,
  severity text not null check (severity in ('critical')),
  title text not null,
  message text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  sent_at timestamptz not null default now()
);

-- Repair column type if it was created as UUID previously
do $$
begin
  if (select data_type from information_schema.columns
      where table_name = 'getvari_admin_alerts' and column_name = 'user_id') = 'uuid' then
    alter table public.getvari_admin_alerts drop constraint if exists getvari_admin_alerts_user_id_fkey;
    alter table public.getvari_admin_alerts alter column user_id type text using user_id::text;
    alter table public.getvari_admin_alerts add constraint getvari_admin_alerts_user_id_fkey
      foreign key (user_id) references public.getvari_profiles(id) on delete cascade;
  end if;
end $$;

-- 2. Enable RLS on all relevant tables
alter table public.getvari_profiles enable row level security;
alter table public.getvari_hydration_logs enable row level security;
alter table public.getvari_devices enable row level security;
alter table public.getvari_admin_alerts enable row level security;

-- 3. Define Admin Access Policy (Helper Function)
-- We check for "is_admin: true" in the user's metadata (Supabase Auth)
create or replace function public.is_admin()
returns boolean as $$
begin
  return (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true;
end;
$$ language plpgsql security definer;

-- 4. Update Policies for getvari_profiles
drop policy if exists "Admins can view all profiles" on public.getvari_profiles;
create policy "Admins can view all profiles"
  on public.getvari_profiles for select
  to authenticated
  using (public.is_admin() or auth.uid()::text = id);

-- 5. Update Policies for getvari_hydration_logs
drop policy if exists "Admins can view all logs" on public.getvari_hydration_logs;
create policy "Admins can view all logs"
  on public.getvari_hydration_logs for select
  to authenticated
  using (public.is_admin() or auth.uid()::text = user_id);

-- 6. Update Policies for getvari_devices
drop policy if exists "Admins can view all devices" on public.getvari_devices;
create policy "Admins can view all devices"
  on public.getvari_devices for select
  to authenticated
  using (public.is_admin() or auth.uid()::text = user_id);

-- 7. Policies for getvari_admin_alerts
drop policy if exists "Admins can manage alerts" on public.getvari_admin_alerts;
create policy "Admins can manage alerts"
  on public.getvari_admin_alerts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ADMIN CREATION STEPS:
-- ----------------------------------------------------------------------------
-- 1. Create a user in the Supabase Dashboard (Authentication > Users > Add User).
--    IMPORTANT: Use the format "username@getvari.admin" (e.g., admin@getvari.admin)
-- 2. Use the SQL below to promote that user to an Admin.
--
-- UPDATE auth.users
-- SET raw_user_meta_data = raw_user_meta_data || '{"is_admin": true}'
-- WHERE email = 'admin@getvari.admin';
-- ----------------------------------------------------------------------------
