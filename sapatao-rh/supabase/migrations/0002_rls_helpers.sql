-- RLS helpers.
-- Strategy: prefer the JWT claim (fast — populated by the custom access token hook
-- when enabled), and fall back to a profiles lookup so RLS works even BEFORE the hook
-- is enabled. SECURITY DEFINER (owner = postgres) bypasses RLS on profiles, so the
-- fallback lookup does not recurse into the profiles policies that call these helpers.

create or replace function public.current_empresa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() ->> 'empresa_id', '')::uuid,
    (select p.empresa_id from public.profiles p where p.id = auth.uid())
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (auth.jwt() ->> 'platform_admin')::boolean,
    (select p.platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() ->> 'user_role', ''),
    (select p.role from public.profiles p where p.id = auth.uid()),
    'viewer'
  );
$$;
