-- Run after inviting/creating the admin user in Supabase Authentication.
-- Only the configured administrator is inserted into the allowlist.
insert into public.dashboard_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = lower('s@vclintl.com')
on conflict (user_id) do update
set email = excluded.email;

do $$
begin
  if not exists (
    select 1
    from public.dashboard_admins
    where email = lower('s@vclintl.com')
  ) then
    raise exception 'Admin account s@vclintl.com was not found. Invite it in Supabase Authentication and rerun this seed.';
  end if;
end
$$;
