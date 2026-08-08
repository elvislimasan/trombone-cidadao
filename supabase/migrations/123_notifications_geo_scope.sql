-- Fase 2: notificações com escopo geográfico
-- Reescreve as funções de notificação de moderação para incluir
-- embaixadores ativos da cidade relevante, além dos admins globais.

-- ── 1. notify_admins_new_report ──────────────────────────────────────────────
-- Nova bronca: notifica admins globais + master + embaixadores da cidade da bronca.
create or replace function public.notify_admins_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'pending_approval' then
    insert into public.notifications (user_id, type, title, message, report_id, is_read, created_at)
    select distinct on (p.id)
      p.id,
      'moderation_required',
      'Moderação de bronca',
      'Uma nova bronca foi cadastrada e aguarda moderação: "' || coalesce(new.title, 'Sem título') || '"',
      new.id,
      false,
      now()
    from public.profiles p
    where
      -- admin global ou master
      (p.is_admin = true or p.is_master = true)
      or
      -- embaixador ativo da cidade da bronca
      (
        new.city_id is not null
        and exists (
          select 1 from public.ambassador_cities ac
          where ac.user_id = p.id
            and ac.city_id = new.city_id
            and ac.status  = 'active'
        )
      );
  end if;

  return new;
end;
$$;

-- ── 2. notify_new_report_update ──────────────────────────────────────────────
-- Atualização de bronca: notifica admins globais + embaixadores da cidade.
-- Mantém a lógica de pending_moderation vs pending/confirmed da migration 108.
create or replace function public.notify_new_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id  uuid;
  v_report_title text;
  v_city_id    bigint;
  v_label      text;
  v_link       text;
begin
  select author_id, title, city_id
    into v_author_id, v_report_title, v_city_id
  from public.reports where id = new.report_id;

  v_label := case new.update_type
    when 'still_here'   then 'O problema ainda está aqui'
    when 'being_solved' then 'O problema está sendo resolvido'
    when 'solved'       then 'O problema foi resolvido'
    else 'Nova atualização'
  end;

  v_link := '/bronca/' || new.report_id;

  -- Auto-confirmado pelo autor ou admin: sem notificação
  if new.status = 'confirmed' then
    return new;
  end if;

  -- Pendente de moderação: notifica admins globais + embaixadores da cidade
  if new.status = 'pending_moderation' then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    select distinct on (p.id)
      p.id,
      'status_update',
      'Atualização aguarda moderação',
      v_label || ' — "' || coalesce(v_report_title, 'Bronca') || '"',
      v_link,
      new.report_id,
      false,
      now()
    from public.profiles p
    where p.id != new.author_id
      and (
        (p.is_admin = true or p.is_master = true)
        or (
          v_city_id is not null
          and exists (
            select 1 from public.ambassador_cities ac
            where ac.user_id = p.id
              and ac.city_id = v_city_id
              and ac.status  = 'active'
          )
        )
      );
    return new;
  end if;

  -- Status 'pending': notifica autor da bronca + admins/embaixadores
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
  select distinct on (p.id)
    p.id,
    'status_update',
    'Atualização de bronca',
    v_label || ' — "' || coalesce(v_report_title, 'Bronca') || '"',
    v_link,
    new.report_id,
    false,
    now()
  from public.profiles p
  where p.id != new.author_id
    and (
      (p.is_admin = true or p.is_master = true)
      or (
        v_city_id is not null
        and exists (
          select 1 from public.ambassador_cities ac
          where ac.user_id = p.id
            and ac.city_id = v_city_id
            and ac.status  = 'active'
        )
      )
    );

  return new;
end;
$$;

-- ── 3. notify_update_approved ────────────────────────────────────────────────
-- Quando admin/embaixador aprova pending_moderation → pending, notifica o autor.
-- Sem mudança de lógica — só registra que foi reescrita para consistência.
create or replace function public.notify_update_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id    uuid;
  v_report_title text;
  v_label        text;
  v_link         text;
begin
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

-- ── 4. notify_admins_new_work_media ─────────────────────────────────────────
-- Mídia de obra: notifica admins globais + embaixadores da cidade da obra (se tiver city_id).
create or replace function public.notify_admins_new_work_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_title text;
  v_city_id    bigint;
begin
  if new.status = 'pending' then
    select title, city_id into v_work_title, v_city_id
    from public.public_works where id = new.work_id;

    insert into public.notifications (user_id, type, message, work_id, is_read, created_at)
    select distinct on (p.id)
      p.id,
      'moderation_required',
      'Nova mídia enviada para a obra "' || coalesce(v_work_title, 'Obra') || '" precisa de moderação.',
      new.work_id,
      false,
      now()
    from public.profiles p
    where
      (p.is_admin = true or p.is_master = true)
      or (
        v_city_id is not null
        and exists (
          select 1 from public.ambassador_cities ac
          where ac.user_id = p.id
            and ac.city_id = v_city_id
            and ac.status  = 'active'
        )
      );
  end if;

  return new;
end;
$$;

-- ── Fim ──────────────────────────────────────────────────────────────────────
