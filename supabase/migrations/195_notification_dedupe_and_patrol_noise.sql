-- Evita alertas duplicados de moderacao e remove o ruido de "ainda esta aqui".
-- O push nativo e disparado por webhook para cada linha de notifications. A
-- protecao contra duplicidade precisa, portanto, existir na propria tabela.

-- Preserva a notificacao mais antiga e remove apenas copias do mesmo evento.
with ranked_moderation_notifications as (
  select
    id,
    row_number() over (
      partition by user_id, report_id
      order by created_at asc nulls last, id
    ) as duplicate_order
  from public.notifications
  where type = 'moderation_required'
    and report_id is not null
)
delete from public.notifications notification
using ranked_moderation_notifications ranked
where notification.id = ranked.id
  and ranked.duplicate_order > 1;

create unique index if not exists notifications_one_moderation_per_report_user
  on public.notifications (user_id, report_id)
  where type = 'moderation_required' and report_id is not null;

create or replace function public.notify_admins_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'pending_approval'
     and not coalesce(
       (
         select coalesce(author.is_admin, false) or coalesce(author.is_master, false)
         from public.profiles author
         where author.id = new.author_id
       ),
       false
     )
  then
    insert into public.notifications
      (user_id, type, title, message, link, report_id, is_read, created_at)
    select distinct on (p.id)
      p.id,
      'moderation_required',
      'Moderacao de bronca',
      'Uma nova bronca foi cadastrada e aguarda moderacao: "' ||
        coalesce(new.title, 'Sem titulo') || '"',
      '/admin/moderacao/broncas',
      new.id,
      false,
      now()
    from public.profiles p
    where
      (p.is_admin = true or p.is_master = true)
      or (
        new.city_id is not null
        and exists (
          select 1
          from public.ambassador_cities ac
          where ac.user_id = p.id
            and ac.city_id = new.city_id
            and ac.status = 'active'
        )
      )
    on conflict (user_id, report_id)
      where type = 'moderation_required' and report_id is not null
      do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.notify_new_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_report_title text;
  v_city_id bigint;
  v_label text;
  v_link text;
begin
  -- Confirmar presenca e frequente na patrulha. Continua registrado e
  -- pontuando, mas nao precisa interromper autor nem moderadores.
  if new.update_type = 'still_here' then
    return new;
  end if;

  select author_id, title, city_id
    into v_author_id, v_report_title, v_city_id
  from public.reports
  where id = new.report_id;

  v_label := case new.update_type
    when 'being_solved' then 'O problema esta sendo resolvido'
    when 'solved' then 'O problema foi resolvido'
    else 'Nova atualizacao'
  end;
  v_link := '/bronca/' || new.report_id;

  if new.status = 'confirmed' then
    return new;
  end if;

  if new.status = 'pending_moderation' then
    insert into public.notifications
      (user_id, type, title, message, link, report_id, is_read, created_at)
    select distinct on (p.id)
      p.id,
      'status_update',
      'Atualizacao aguarda moderacao',
      v_label || ' - "' || coalesce(v_report_title, 'Bronca') || '"',
      v_link,
      new.report_id,
      false,
      now()
    from public.profiles p
    where p.id != new.author_id
      and (
        p.is_admin = true
        or p.is_master = true
        or (
          v_city_id is not null
          and exists (
            select 1
            from public.ambassador_cities ac
            where ac.user_id = p.id
              and ac.city_id = v_city_id
              and ac.status = 'active'
          )
        )
      );
    return new;
  end if;

  if v_author_id is not null and v_author_id != new.author_id then
    insert into public.notifications
      (user_id, type, title, message, link, report_id, is_read, created_at)
    values (
      v_author_id,
      'status_update',
      'Atualizacao na sua bronca',
      v_label || ' - "' || coalesce(v_report_title, 'Bronca') || '"',
      v_link,
      new.report_id,
      false,
      now()
    );
  end if;

  insert into public.notifications
    (user_id, type, title, message, link, report_id, is_read, created_at)
  select distinct on (p.id)
    p.id,
    'status_update',
    'Atualizacao de bronca',
    v_label || ' - "' || coalesce(v_report_title, 'Bronca') || '"',
    v_link,
    new.report_id,
    false,
    now()
  from public.profiles p
  where p.id != new.author_id
    and (
      p.is_admin = true
      or p.is_master = true
      or (
        v_city_id is not null
        and exists (
          select 1
          from public.ambassador_cities ac
          where ac.user_id = p.id
            and ac.city_id = v_city_id
            and ac.status = 'active'
        )
      )
    );

  return new;
end;
$$;

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
begin
  if new.update_type = 'still_here' then
    return new;
  end if;

  if old.status = 'pending_moderation' and new.status = 'pending' then
    select author_id, title
      into v_author_id, v_report_title
    from public.reports
    where id = new.report_id;

    v_label := case new.update_type
      when 'being_solved' then 'O problema esta sendo resolvido'
      when 'solved' then 'O problema foi resolvido'
      else 'Nova atualizacao'
    end;

    if v_author_id is not null and v_author_id != new.author_id then
      insert into public.notifications
        (user_id, type, title, message, link, report_id, is_read, created_at)
      values (
        v_author_id,
        'status_update',
        'Atualizacao aprovada',
        v_label || ' - "' || coalesce(v_report_title, 'Bronca') || '"',
        '/bronca/' || new.report_id,
        new.report_id,
        false,
        now()
      );
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
