-- SP1a — trigger on_new_message (preview/unread automáticos + fan-out realtime)
create or replace function public.on_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.conteudo, initcap(new.tipo)), 120),
    last_message_direction = new.direction,
    unread_count = case when new.direction = 'inbound' then unread_count + 1 else unread_count end,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_new_message();
