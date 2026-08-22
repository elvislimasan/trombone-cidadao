-- 174_neighborhood_scoring.sql
--
-- Pontuacao com sinais e missoes, e placar por bairro.
--
-- Continua DERIVADA, como a 169 e a 172 decidiram: nenhuma coluna de saldo,
-- nenhuma tabela de conquista, nenhum job de desbloqueio. Tudo sai do estado
-- atual das linhas, na hora da consulta.
--
-- Foi o que tornou barato o requisito de "pontos revogaveis": quando alguem vai
-- ao local e marca a missao como 'empty', nao ha estorno a fazer - a consulta
-- simplesmente para de contar aquele sinal. Num modelo de saldo gravado isso
-- seria uma linha de estorno, um trigger e um backfill.
--
-- ESCALA DE PONTOS
--
--   bronca completa .......... 10   (foto, local, descricao - inalterado)
--   MISSAO CUMPRIDA .......... 12   para quem completou
--   SINAL (aberto ou virou) ... 3   para quem sinalizou
--   sinal marcado 'empty' ..... 0   deixa de ser contado
--   atualizacao ............... 5
--   comentario ................ 2
--   apoio ..................... 1
--
-- Por que a missao vale 12 e nao 10: ir aonde OUTRA pessoa apontou e mais
-- trabalhoso que cadastrar o que se encontrou no proprio caminho. Sem esse
-- premio, cumprir missao seria estritamente pior que registrar bronca propria,
-- e ninguem cumpriria nenhuma.
--
-- Por que o sinal vale 3: precisa valer o bastante para o toque acontecer e
-- pouco o bastante para nao competir com o cadastro completo.

-- ── Notificacao de sinal descartado ──────────────────────────────────────────
--
-- O gatilho de moderacao avisa "Bronca rejeitada. Confira o motivo." quando
-- moderation_status vira 'rejected'. Como marcar a missao como 'empty' usa esse
-- mesmo status, o sinalizador receberia uma mensagem que nao descreve o que
-- aconteceu - ninguem rejeitou nada, alguem foi ao local e nao achou o
-- problema. Aqui o texto passa a depender da origem da linha.
create or replace function public.notify_report_moderation_update()
returns trigger as $$
begin
  if new.moderation_status is distinct from old.moderation_status then
    if new.moderation_status = 'rejected' and new.author_id is not null then
      if new.origin = 'signal' then
        insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
        values (
          new.author_id,
          'moderation_update',
          'Sinal encerrado',
          'Alguem foi ao local que voce sinalizou e nao encontrou o problema.',
          '/painel-usuario?tab=reports&report=' || new.id,
          false,
          now()
        );
      else
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

-- ── Nivel do usuario ─────────────────────────────────────────────────────────
--
-- Substitui a versao da 169. As contagens antigas continuam identicas; o que
-- muda e que `reports_count` passa a exigir `origin = 'full'`.
--
-- Esse filtro nao e detalhe: quando um sinal e completado, a linha continua
-- tendo o SINALIZADOR como author_id - e o que credita quem apontou o problema.
-- Sem o filtro, ele receberia tambem os 10 pontos do cadastro que nao fez, e a
-- missao pagaria 22 pontos somados em vez de 15.
--
-- PRECISA DE DROP ANTES DO CREATE
--
-- `create or replace` nao consegue mudar o tipo de retorno de uma funcao que ja
-- existe (42P13): a 169 devolve 7 colunas e esta devolve 9, e o row type dos
-- parametros OUT faz parte da identidade da funcao. Acrescentar coluna a um
-- `returns table` e, para o Postgres, definir outra funcao.
--
-- `drop` simples, nunca `cascade`. Nenhuma view, policy ou funcao depende desta
-- - so chamadas RPC do cliente (ProfilePage e usePatrolGame), que o banco nao
-- enxerga. Se um dia passar a existir dependente, e melhor esta migracao parar
-- com erro do que derrubar o dependente em silencio.
drop function if exists public.get_user_level(uuid);

create function public.get_user_level(target_user_id uuid)
returns table (
  points integer,
  level integer,
  label text,
  reports_count integer,
  updates_count integer,
  comments_count integer,
  upvotes_given integer,
  signals_count integer,
  missions_count integer
)
language sql
stable
as $$
  with counts as (
    select
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'full'
          and r.moderation_status = 'approved')::integer as reports_count,
      (select count(*) from public.report_updates u
        where u.author_id = target_user_id)::integer as updates_count,
      (select count(*) from public.comments c
        where c.author_id = target_user_id)::integer as comments_count,
      (select count(*) from public.signatures s
        where s.user_id = target_user_id)::integer as upvotes_given,
      -- Sinal em 'empty' fica de fora: e a revogacao acontecendo, sem estorno.
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'signal'
          and r.signal_status in ('open', 'done'))::integer as signals_count,
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved')::integer as missions_count
  ),
  scored as (
    select
      counts.*,
      (reports_count * 10
        + missions_count * 12
        + signals_count * 3
        + updates_count * 5
        + comments_count * 2
        + upvotes_given * 1)::integer as points
    from counts
  )
  select
    points,
    case
      when points >= 300 then 4
      when points >= 100 then 3
      when points >= 20  then 2
      else 1
    end as level,
    case
      when points >= 300 then 'Guardião da cidade'
      when points >= 100 then 'Voz da comunidade'
      when points >= 20  then 'Cidadão ativo'
      else 'Novo por aqui'
    end as label,
    reports_count,
    updates_count,
    comments_count,
    upvotes_given,
    signals_count,
    missions_count
  from scored;
$$;

comment on function public.get_user_level(uuid) is
  'Nivel e pontos do usuario, derivados das broncas aprovadas, missoes cumpridas, sinais validos, atualizacoes, comentarios e apoios.';

grant execute on function public.get_user_level(uuid) to anon, authenticated;

-- ── Acoes com bairro ─────────────────────────────────────────────────────────
--
-- Base comum dos dois placares de bairro. So acoes DE CAMPO entram: bronca,
-- missao, sinal e atualizacao. Comentario e apoio ficam fora de proposito -
-- nao tem lugar no mundo, e contá-los deixaria o titulo de "Guardiao do Centro"
-- ao alcance de quem nunca saiu de casa.
--
-- A JANELA MOVEL de 90 dias e a decisao central. Titulo vitalicio se conquista
-- uma vez e se esquece; titulo que expira traz a pessoa de volta ao bairro.
create or replace function public.neighborhood_actions(dias integer default 90)
returns table (
  user_id uuid,
  city_id bigint,
  neighborhood text,
  pontos integer,
  acoes integer,
  posicao integer,
  participantes integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with limite as (
    select now() - make_interval(days => greatest(1, least(coalesce(dias, 90), 365))) as desde
  ),
  acoes as (
    select r.author_id as user_id, r.city_id, r.neighborhood, 10 as pontos
    from public.reports r cross join limite l
    where r.origin = 'full'
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.created_at >= l.desde

    union all

    select r.completed_by, r.city_id, r.neighborhood, 12
    from public.reports r cross join limite l
    where r.signal_status = 'done'
      and r.completed_by is not null
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.completed_at >= l.desde

    union all

    select r.author_id, r.city_id, r.neighborhood, 3
    from public.reports r cross join limite l
    where r.origin = 'signal'
      and r.signal_status in ('open', 'done')
      and r.neighborhood is not null
      and r.created_at >= l.desde

    union all

    select u.author_id, r.city_id, r.neighborhood, 5
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    cross join limite l
    where r.neighborhood is not null
      and u.created_at >= l.desde
      and coalesce(u.status, '') <> 'rejected'
  ),
  somado as (
    select
      a.user_id,
      a.city_id,
      a.neighborhood,
      sum(a.pontos)::integer as pontos,
      count(*)::integer as acoes
    from acoes a
    where a.user_id is not null
    group by a.user_id, a.city_id, a.neighborhood
  )
  select
    s.user_id,
    s.city_id,
    s.neighborhood,
    s.pontos,
    s.acoes,
    rank() over (
      partition by s.city_id, s.neighborhood order by s.pontos desc
    )::integer as posicao,
    count(*) over (partition by s.city_id, s.neighborhood)::integer as participantes
  from somado s;
$$;

grant execute on function public.neighborhood_actions(integer) to authenticated;

-- ── Onde eu estou em cada bairro ─────────────────────────────────────────────
--
-- Alimenta os titulos. O rotulo em si ("Guardiao do Centro") e montado no JS,
-- junto das medalhas, para que mudar a regra de titulo nao exija migracao -
-- mesma escolha do catalogo de conquistas em patrolGame.js.
create or replace function public.get_neighborhood_standing(
  target_user_id uuid,
  target_city_id bigint default null,
  dias integer default 90
)
returns table (
  neighborhood text,
  city_id bigint,
  pontos integer,
  acoes integer,
  posicao integer,
  participantes integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    n.neighborhood,
    n.city_id,
    n.pontos,
    n.acoes,
    n.posicao,
    n.participantes
  from public.neighborhood_actions(dias) n
  where n.user_id = target_user_id
    and (target_city_id is null or n.city_id = target_city_id)
  order by n.pontos desc, n.neighborhood;
$$;

grant execute on function public.get_neighborhood_standing(uuid, bigint, integer) to authenticated;

-- ── Placar de um bairro ──────────────────────────────────────────────────────
--
-- `security definer` pelo mesmo motivo da patrol_ranking na 172: sem ele, a RLS
-- faria cada visitante ver um total diferente, e o placar deixaria de ser um
-- placar. O conjunto de linhas contadas e fixo e esta escrito acima.
create or replace function public.neighborhood_ranking(
  target_city_id bigint,
  target_neighborhood text,
  dias integer default 90,
  limite integer default 10
)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  pontos integer,
  acoes integer,
  posicao integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    n.user_id,
    p.name,
    p.avatar_url,
    n.pontos,
    n.acoes,
    n.posicao
  from public.neighborhood_actions(dias) n
  join public.profiles p on p.id = n.user_id
  where n.city_id = target_city_id
    and lower(n.neighborhood) = lower(target_neighborhood)
  order by n.posicao
  limit greatest(1, least(coalesce(limite, 10), 100));
$$;

grant execute on function public.neighborhood_ranking(bigint, text, integer, integer) to anon, authenticated;
