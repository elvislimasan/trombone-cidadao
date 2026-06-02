-- Corrige o trigger: adiciona title e link nas notificações
-- O title é usado pela Edge Function send-push-notification no push nativo (FCM/VAPID)
-- O link garante deep-link correto mesmo que report_id não seja interpretado

create or replace function public.notify_new_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_report_title text;
  v_label text;
  v_link text;
begin
  select author_id, title into v_author_id, v_report_title
  from public.reports where id = new.report_id;

  v_label := case new.update_type
    when 'still_here'   then 'O problema ainda está aqui'
    when 'being_solved' then 'O problema está sendo resolvido'
    when 'solved'       then 'O problema foi resolvido'
    else 'Nova atualização'
  end;

  v_link := '/bronca/' || new.report_id;

  -- Notifica o criador da bronca (se não for quem enviou)
  if v_author_id is not null and v_author_id != new.author_id then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    values (
      v_author_id,
      'status_update',
      'Atualização na sua bronca',
      v_label || ' — "' || coalesce(v_report_title, 'Bronca') || '"',
      v_link,
      new.report_id,
      false,
      now()
    );
  end if;

  -- Notifica admins (exceto quem enviou)
  insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
  select
    ma.user_id,
    'status_update',
    'Atualização de bronca',
    v_label || ' — "' || coalesce(v_report_title, 'Bronca') || '"',
    v_link,
    new.report_id,
    false,
    now()
  from public.moderation_admins ma
  where ma.user_id != new.author_id;

  return new;
end;
$$;
