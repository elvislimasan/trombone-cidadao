-- Adiciona suporte a moderação de atualizações de bronca
-- Novos status: pending_moderation (aguardando moderação), rejected (rejeitado)
-- Fluxo: regular user → pending_moderation → admin aprova → pending → autor confirma → confirmed

-- 1. Modifica o trigger de INSERT para:
--    - Quando status = 'pending_moderation': notifica apenas admins (não o autor da bronca)
--    - Quando status = 'confirmed' (auto-confirmado pelo autor/admin): não notifica ninguém
--    - Quando status = 'pending': fluxo legado, notifica todos
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

  -- Se auto-confirmado (autor ou admin enviou), não notifica ninguém
  if new.status = 'confirmed' then
    return new;
  end if;

  -- Se pendente de moderação: notifica apenas admins
  if new.status = 'pending_moderation' then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    select
      ma.user_id,
      'status_update',
      'Atualização aguarda moderação',
      v_label || ' — "' || coalesce(v_report_title, 'Bronca') || '"',
      v_link,
      new.report_id,
      false,
      now()
    from public.moderation_admins ma
    where ma.user_id != new.author_id;
    return new;
  end if;

  -- Status 'pending' (legado ou após aprovação manual): notifica autor da bronca + admins
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

-- 2. Trigger de UPDATE: quando admin aprova (pending_moderation → pending), notifica autor da bronca
create or replace function public.notify_update_approved()
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
  -- Só age quando muda de pending_moderation para pending
  if old.status = 'pending_moderation' and new.status = 'pending' then
    select author_id, title into v_author_id, v_report_title
    from public.reports where id = new.report_id;

    v_label := case new.update_type
      when 'still_here'   then 'O problema ainda está aqui'
      when 'being_solved' then 'O problema está sendo resolvido'
      when 'solved'       then 'O problema foi resolvido'
      else 'Nova atualização'
    end;

    v_link := '/bronca/' || new.report_id;

    -- Notifica o autor da bronca (se não for quem enviou a atualização)
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
  end if;

  return new;
end;
$$;

drop trigger if exists on_update_approved on public.report_updates;
create trigger on_update_approved
  after update on public.report_updates
  for each row execute procedure public.notify_update_approved();

notify pgrst, 'reload schema';
