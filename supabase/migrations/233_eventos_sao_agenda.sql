-- Eventos culturais são agenda, não alertas operacionais.
-- A recorrência semanal avança a mesma ocorrência, preservando seu link.

alter table public.city_events
  add column if not exists recurrence text;

alter table public.city_events
  drop constraint if exists city_events_recurrence_valida;

alter table public.city_events
  add constraint city_events_recurrence_valida
  check (recurrence is null or recurrence = 'weekly');

comment on column public.city_events.recurrence is
  'Recorrência de agenda. Atualmente aceita weekly; nulo significa ocorrência única.';

-- Corrige eventos antigos que já tinham caído no fluxo de "verificar se
-- normalizou". A correção é deliberadamente silenciosa.
update public.city_events set
  status = 'resolved',
  resolved_at = coalesce(estimated_end_at, now()),
  overdue_notified_at = null
where type = 'event'
  and status = 'awaiting_confirmation'
  and coalesce(estimated_end_at, started_at + interval '6 hours') <= now();

update public.city_events set status = 'active', overdue_notified_at = null
where type = 'event' and status = 'awaiting_confirmation';

drop function if exists public.sweep_city_events();

create function public.sweep_city_events()
returns table (publicados integer, vencidos integer, parados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          bigint;
  v_titulo      text;
  v_publicados  integer := 0;
  v_vencidos    integer := 0;
  v_parados     integer := 0;
begin
  -- Alertas avisam ao começar. Eventos apenas mudam de posição na agenda.
  for v_id, v_titulo in
    select id, title from public.city_events
    where status = 'scheduled' and started_at <= now()
  loop
    update public.city_events set status = 'active' where id = v_id;
    if (select type <> 'event' from public.city_events where id = v_id) then
      perform public.notify_city_event_audience(
        v_id, 'city_event', v_titulo, 'Comecou agora. Toque para ver a situacao.'
      );
    end if;
    v_publicados := v_publicados + 1;
  end loop;

  -- Encerrar um evento é silencioso. O semanal avança para a próxima semana.
  update public.city_events e set
    started_at = e.started_at + (
      floor(extract(epoch from (now() - e.started_at)) / 604800)::integer + 1
    ) * interval '7 days',
    estimated_end_at = case when e.estimated_end_at is null then null else
      e.estimated_end_at + (
        floor(extract(epoch from (now() - e.started_at)) / 604800)::integer + 1
      ) * interval '7 days' end,
    status = 'scheduled',
    overdue_notified_at = null
  where e.type = 'event'
    and e.recurrence = 'weekly'
    and e.status in ('active', 'scheduled')
    and coalesce(e.estimated_end_at, e.started_at + interval '6 hours') <= now();

  update public.city_events e set
    status = 'resolved',
    resolved_at = coalesce(e.estimated_end_at, now()),
    overdue_notified_at = null
  where e.type = 'event'
    and e.recurrence is null
    and e.status in ('active', 'scheduled')
    and coalesce(e.estimated_end_at, e.started_at + interval '6 hours') <= now();

  -- Apenas ocorrências operacionais têm previsão de normalização.
  for v_id, v_titulo in
    select id, title from public.city_events
    where type <> 'event'
      and status = 'active'
      and estimated_end_at is not null
      and estimated_end_at <= now()
      and overdue_notified_at is null
  loop
    update public.city_events set status = 'awaiting_confirmation', overdue_notified_at = now()
    where id = v_id;
    perform public.notify_city_event_managers(
      v_id, 'city_event_check', 'Verificar acontecimento',
      'A previsao de "' || v_titulo || '" terminou. O problema ja foi resolvido?'
    );
    v_vencidos := v_vencidos + 1;
  end loop;

  for v_id, v_titulo in
    select e.id, e.title
    from public.city_events e
    where e.type <> 'event'
      and e.status = 'active'
      and e.estimated_end_at is null
      and greatest(
        e.started_at,
        coalesce(e.overdue_notified_at, e.started_at),
        coalesce((select max(u.created_at) from public.city_event_updates u where u.city_event_id = e.id), e.started_at)
      ) <= now() - interval '24 hours'
  loop
    update public.city_events set overdue_notified_at = now() where id = v_id;
    perform public.notify_city_event_managers(
      v_id, 'city_event_check', 'Acontecimento sem noticia',
      '"' || v_titulo || '" esta sem previsao e sem atualizacao ha mais de um dia. Ja normalizou?'
    );
    v_parados := v_parados + 1;
  end loop;

  return query select v_publicados, v_vencidos, v_parados;
end;
$$;

grant execute on function public.sweep_city_events() to authenticated;
notify pgrst, 'reload schema';
