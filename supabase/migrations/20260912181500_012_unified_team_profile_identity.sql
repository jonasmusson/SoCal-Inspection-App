-- Unified SoCal staff identity foundation.
-- The website Team Profile ID is the permanent cross-tool staff identifier.
-- Supabase auth remains the authentication provider for the Inspection App.

alter table public.user_profiles
  add column if not exists team_profile_id text;

create unique index if not exists user_profiles_team_profile_id_unique
  on public.user_profiles(team_profile_id)
  where team_profile_id is not null;

comment on column public.user_profiles.team_profile_id is
  'Canonical SoCal Team Profile ID. Stable across email/login changes and shared by inspections, worksheets, future timecards and labor reporting.';

-- Managers/owners may link an app account to a Team Profile. Techs can read their
-- own link through the existing user_profiles select policy but should not be able
-- to assign or change identity links themselves.
create or replace function public.link_user_team_profile(
  target_user_id uuid,
  target_team_profile_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Manager or owner access required';
  end if;

  if target_team_profile_id is null or btrim(target_team_profile_id) = '' then
    raise exception 'Team Profile ID is required';
  end if;

  update public.user_profiles
  set team_profile_id = btrim(target_team_profile_id),
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'User profile not found';
  end if;
end;
$$;

grant execute on function public.link_user_team_profile(uuid, text) to authenticated;
