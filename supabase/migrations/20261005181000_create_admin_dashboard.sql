create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table if not exists public.dashboard_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.dashboard_admins enable row level security;

create or replace function app_private.is_dashboard_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dashboard_admins as administrator
    where administrator.user_id = (select auth.uid())
      and administrator.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

revoke all on function app_private.is_dashboard_admin() from public;
grant execute on function app_private.is_dashboard_admin() to authenticated;

drop policy if exists "Administrators can read their own admin record"
  on public.dashboard_admins;
create policy "Administrators can read their own admin record"
  on public.dashboard_admins
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

create table if not exists public.app_state (
  id text primary key check (id = 'primary'),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "Administrators can read dashboard state" on public.app_state;
create policy "Administrators can read dashboard state"
  on public.app_state
  for select
  to authenticated
  using ((select app_private.is_dashboard_admin()));

drop policy if exists "Administrators can create dashboard state" on public.app_state;
create policy "Administrators can create dashboard state"
  on public.app_state
  for insert
  to authenticated
  with check ((select app_private.is_dashboard_admin()));

drop policy if exists "Administrators can update dashboard state" on public.app_state;
create policy "Administrators can update dashboard state"
  on public.app_state
  for update
  to authenticated
  using ((select app_private.is_dashboard_admin()))
  with check ((select app_private.is_dashboard_admin()));

grant select, insert, update on public.app_state to authenticated;
grant select on public.dashboard_admins to authenticated;
grant select, insert, update on public.app_state to service_role;
grant select on public.dashboard_admins to service_role;

insert into public.app_state (id, state)
values (
  'primary',
  '{
    "business": {
      "name": "Jouw zaak",
      "phone": "",
      "address": "",
      "openingHours": "Maandag t/m zondag, 12:00–22:00",
      "pickupAvailable": true,
      "deliveryAvailable": true,
      "deliveryArea": "",
      "preparationMinutes": 25,
      "deliveryMinutes": 40,
      "language": "nl-NL"
    },
    "menu": [
      {
        "id": "item-1",
        "name": "Borrelplank",
        "description": "Een selectie van warme en koude hapjes",
        "price": 18.5,
        "available": true
      },
      {
        "id": "item-2",
        "name": "Koffie",
        "description": "Verse koffie",
        "price": 3.25,
        "available": true
      },
      {
        "id": "item-3",
        "name": "Bowlen (1 uur)",
        "description": "Een bowlingbaan voor maximaal 6 personen",
        "price": 32,
        "available": true
      }
    ],
    "orders": [],
    "bookings": [],
    "calls": [],
    "integration": {
      "assistantId": "",
      "assistantStatus": "Niet gekoppeld",
      "deployedAt": ""
    }
  }'::jsonb
)
on conflict (id) do nothing;
