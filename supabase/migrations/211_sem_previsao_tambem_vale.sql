-- 211_sem_previsao_tambem_vale.sql
--
-- "Ainda nao normalizou, e nao sei quando" passa a ser uma resposta possivel.
--
-- O QUE ESTAVA BLOQUEADO
--
-- Publicar SEM previsao ja funcionava: `estimated_end_at` e nulo desde a 206, e
-- o formulario nunca exigiu o campo. O que nao funcionava era PRORROGAR sem
-- previsao — `extend_city_event` levantava "Informe a nova previsao".
--
-- E justamente a hora em que a resposta honesta costuma ser "nao sei". A
-- previsao venceu, o responsavel abre o aviso, e as duas saidas eram inventar um
-- horario ou nao responder. Inventar horario e o pior dos dois: ele vence de
-- novo, o sistema cobra de novo, e a cidade le uma promessa que ninguem fez.
--
-- POR QUE ISSO NAO PODE VIR SOZINHO
--
-- A varredura da 206 so olha `estimated_end_at is not null`. Liberar a
-- prorrogacao vazia sem mexer nela transformaria "sem previsao" em buraco negro:
-- o gestor responde "nao sei quando", o evento volta para `active`, e NINGUEM
-- pergunta nunca mais. O alerta ficaria aberto para sempre — e um alerta eterno
-- e indistinguivel de um alerta esquecido.
--
-- Entao a varredura ganha uma terceira regra: acontecimento aberto, sem
-- previsao e sem noticia ha mais de 24 horas cutuca quem responde pela cidade.
-- Um dia inteiro sem novidade num aviso ativo e o ponto em que a cidade merece
-- uma palavra, mesmo que a palavra seja "continua".

-- ── Prorrogar aceita "sem previsao" ─────────────────────────────────────────
--
-- Nulo aqui significa LIMPAR, e nao "nao mexer" — diferente do resto das RPCs.
-- Nao ha ambiguidade: definir a previsao e a unica coisa que esta funcao faz, e
-- chama-la sem valor so pode querer dizer uma coisa.

drop function if exists public.extend_city_event(bigint, timestamptz, text, boolean);

create function public.extend_city_event(
  p_event_id             bigint,
  p_new_estimated_end_at timestamptz default null,
  p_message              text default null,
  p_day_only             boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_event public.city_events;
  v_role  text;
begin
  select * into v_event from public.city_events where id = p_event_id;
  if not found then
    raise exception 'Acontecimento nao encontrado.' using errcode = 'P0002';
  end if;

  v_role := public.city_event_role(v_user, v_event.city_id);
  if v_role is null then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  if p_new_estimated_end_at is not null and p_new_estimated_end_at <= now() then
    raise exception 'A nova previsao precisa ser no futuro.' using errcode = '22023';
  end if;

  insert into public.city_event_updates (
    city_event_id, type, message, old_estimated_end_at, new_estimated_end_at, created_by, created_by_role
  ) values (
    p_event_id, 'extended', nullif(btrim(coalesce(p_message, '')), ''),
    v_event.estimated_end_at, p_new_estimated_end_at, v_user, v_role
  );

  update public.city_events set
    status                 = 'active',
    estimated_end_at       = p_new_estimated_end_at,
    -- Sem previsao nao ha hora a esconder: a bandeira volta a false para nao
    -- sobreviver a uma prorrogacao que a tornou sem sentido.
    estimated_end_day_only = case
                               when p_new_estimated_end_at is null then false
                               else coalesce(p_day_only, estimated_end_day_only)
                             end,
    -- Zera o relogio das duas cutucadas: a de previsao vencida e a de silencio.
    overdue_notified_at    = null
  where id = p_event_id;

  perform public.notify_city_event_audience(
    p_event_id, 'city_event_update',
    case when p_new_estimated_end_at is null
      then v_event.title || ' — sem previsao'
      else 'Previsao atualizada'
    end,
    case when p_new_estimated_end_at is null
      then 'O acontecimento continua, e ainda nao ha previsao de normalizacao.'
      else v_event.title || ' — nova previsao registrada.'
    end,
    v_user
  );
end;
$$;

-- ── A varredura passa a cobrar o silencio ───────────────────────────────────

comment on column public.city_events.overdue_notified_at is
  'Quando o responsavel foi cutucado pela ultima vez, por previsao vencida ou por silencio prolongado. Torna a varredura idempotente e espaca a cobranca.';

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
  -- 1. Programado cuja hora chegou vira ativo e avisa quem acompanha.
  for v_id, v_titulo in
    select id, title from public.city_events
    where status = 'scheduled' and started_at <= now()
  loop
    update public.city_events set status = 'active' where id = v_id;
    perform public.notify_city_event_audience(
      v_id, 'city_event', v_titulo, 'Comecou agora. Toque para ver a situacao.'
    );
    v_publicados := v_publicados + 1;
  end loop;

  -- 2. Previsao vencida: nao encerra (regra 4), chama o responsavel.
  for v_id, v_titulo in
    select id, title from public.city_events
    where status = 'active'
      and estimated_end_at is not null
      and estimated_end_at <= now()
      and overdue_notified_at is null
  loop
    update public.city_events set
      status = 'awaiting_confirmation',
      overdue_notified_at = now()
    where id = v_id;

    perform public.notify_city_event_managers(
      v_id, 'city_event_check', 'Verificar acontecimento',
      'A previsao de "' || v_titulo || '" terminou. O problema ja foi resolvido?'
    );
    v_vencidos := v_vencidos + 1;
  end loop;

  -- 3. Sem previsao e sem noticia ha mais de um dia.
  --
  -- NAO muda o status. Nao ha previsao para estar vencida, entao
  -- `awaiting_confirmation` seria mentira — o que existe e silencio, e silencio
  -- se resolve com uma pergunta, nao com uma mudanca de estado.
  --
  -- Cutuca no maximo uma vez por dia: o relogio conta a partir da coisa mais
  -- recente que aconteceu no evento (inicio, ultima atualizacao, ultima
  -- cutucada). Sem isso, um evento parado geraria uma notificacao a cada
  -- passagem da varredura.
  for v_id, v_titulo in
    select e.id, e.title
    from public.city_events e
    where e.status = 'active'
      and e.estimated_end_at is null
      and greatest(
            e.started_at,
            coalesce(e.overdue_notified_at, e.started_at),
            coalesce(
              (select max(u.created_at) from public.city_event_updates u where u.city_event_id = e.id),
              e.started_at
            )
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

-- O indice da 206 cobre a regra 2. A regra 3 precisa do proprio recorte.
create index if not exists city_events_sem_previsao_idx
  on public.city_events (started_at)
  where status = 'active' and estimated_end_at is null;

grant execute on function public.extend_city_event(bigint, timestamptz, text, boolean) to authenticated;
grant execute on function public.sweep_city_events()                                   to authenticated;

notify pgrst, 'reload schema';
