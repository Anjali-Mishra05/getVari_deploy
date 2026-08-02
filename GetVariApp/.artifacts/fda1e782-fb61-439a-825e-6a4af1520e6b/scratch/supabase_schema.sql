-- Updated Schema based on your current Supabase setup

-- (Already created) Vector support
-- create extension if not exists vector;
-- create table if not exists documents (...);

-- (Already created) Profiles table
-- Stores the UserProfile object as a JSON blob
-- create table if not exists public.getvari_profiles (
--   id text primary key, -- Use Supabase User UUID
--   profile jsonb not null,
--   updated_at timestamptz not null default now()
-- );

-- (Already created) Hydration Logs table
-- create table if not exists public.getvari_hydration_logs (
--   id text primary key,
--   timestamp timestamptz not null,
--   amount_ml integer not null,
--   source text not null,
--   updated_at timestamptz not null default now()
-- );

-- SUGGESTED ADDITION: Device pairing table
-- To track which ESP32/Wearable is linked to which user
create table if not exists public.getvari_devices (
  id uuid default gen_random_uuid() primary key,
  user_id text not null, -- Links to getvari_profiles.id
  device_id text not null,
  name text,
  battery_level integer,
  last_synced timestamptz default now(),
  created_at timestamptz default now()
);

-- Enable RLS for the new table
alter table public.getvari_devices enable row level security;

-- Public policy for the new table (matching your current open access for the prototype)
do $$
begin
  create policy "public read write getvari_devices"
    on public.getvari_devices
    for all
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

-- IMPORTANT NOTE:
-- For the hydration logs to be user-specific, we should ideally add a 'user_id' column:
-- ALTER TABLE public.getvari_hydration_logs ADD COLUMN user_id TEXT;
