-- Repair/bootstrap the designated shop owner even when the auth account was
-- created before the secure owner trigger was installed.
UPDATE public.user_profiles
SET role = 'owner',
    status = 'active',
    updated_at = now()
WHERE lower(email) = 'jonasmusson@gmail.com';

-- Keep the signup trigger authoritative: the client must not choose its own
-- role or approval state.
DROP POLICY IF EXISTS users_update_own ON public.user_profiles;
DROP POLICY IF EXISTS users_insert_own ON public.user_profiles;
