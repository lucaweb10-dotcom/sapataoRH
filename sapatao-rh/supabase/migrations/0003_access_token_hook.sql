-- Custom Access Token Hook (OPTIONAL optimization).
-- When enabled in the Supabase Dashboard (Authentication > Hooks > Custom Access Token),
-- this injects empresa_id / user_role / platform_admin into the JWT so the RLS helpers
-- read claims directly instead of querying profiles. The app works WITHOUT it (the
-- helpers in 0002 fall back to a profiles lookup); enabling it is purely for performance.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := event->'claims';
  v_empresa uuid; v_role text; v_platform boolean;
begin
  select empresa_id, role, platform_admin
    into v_empresa, v_role, v_platform
  from public.profiles where id = (event->>'user_id')::uuid;

  if v_empresa is not null then
    claims := jsonb_set(claims, '{empresa_id}',     to_jsonb(v_empresa::text));
    claims := jsonb_set(claims, '{user_role}',      to_jsonb(coalesce(v_role,'viewer')));
    claims := jsonb_set(claims, '{platform_admin}', to_jsonb(coalesce(v_platform,false)));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;

-- Auth admin runs the hook and must be able to read profiles during token minting.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.profiles to supabase_auth_admin;

drop policy if exists auth_admin_reads_profiles on public.profiles;
create policy auth_admin_reads_profiles on public.profiles
  for select to supabase_auth_admin using (true);
