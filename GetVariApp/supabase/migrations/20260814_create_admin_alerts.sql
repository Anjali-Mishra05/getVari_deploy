create table if not exists public.getvari_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.getvari_profiles(id) on delete cascade,
  severity text not null check (severity in ('critical')),
  title text not null,
  message text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  sent_at timestamptz not null default now()
);

alter table public.getvari_admin_alerts enable row level security;

create policy "Authenticated users can read admin alerts"
  on public.getvari_admin_alerts for select to authenticated using (true);

create policy "Authenticated users can create admin alerts"
  on public.getvari_admin_alerts for insert to authenticated with check (true);
