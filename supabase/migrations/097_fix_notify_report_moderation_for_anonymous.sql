create or replace function public.notify_report_moderation_update()
returns trigger as $$
begin
  if new.moderation_status is distinct from old.moderation_status then
    if new.moderation_status = 'rejected' then
      if new.author_id is not null then
        insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
        values (
          new.author_id,
          'moderation_update',
          'Bronca rejeitada',
          'Sua bronca foi rejeitada. Confira o motivo.',
          '/painel-usuario?tab=reports&report=' || new.id,
          false,
          now()
        );
      end if;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

