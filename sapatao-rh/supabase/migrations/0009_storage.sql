-- SP1a — buckets privados + RLS escopada por empresa (pasta raiz = empresa_id)
insert into storage.buckets (id, name, public) values
  ('whatsapp-media', 'whatsapp-media', false),
  ('curriculos', 'curriculos', false)
on conflict (id) do nothing;

drop policy if exists wa_media_select on storage.objects;
create policy wa_media_select on storage.objects for select to authenticated
  using (
    bucket_id in ('whatsapp-media','curriculos')
    and (storage.foldername(name))[1] = public.current_empresa_id()::text
  );

drop policy if exists wa_media_insert on storage.objects;
create policy wa_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('whatsapp-media','curriculos')
    and (storage.foldername(name))[1] = public.current_empresa_id()::text
    and public.current_user_role() in ('admin','rh')
  );
