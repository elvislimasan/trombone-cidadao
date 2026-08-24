-- 169_user_levels.sql
--
-- Nivel do usuario a partir da contribuicao real na plataforma.
--
-- O nivel NAO e uma coluna gravada em profiles: seria mais um dado para manter
-- em sincronia (trigger em reports, signatures e comments, mais backfill a cada
-- mudanca de regra). Como as contagens ja existem nas tabelas de origem, a
-- funcao calcula na hora e a regra fica num lugar so.
--
-- Pontuacao — pesa o esforco de cada acao:
--   bronca registrada .... 10 pontos (exige foto, local, descricao)
--   atualizacao enviada ... 5 pontos (exige ir ao local de novo)
--   comentario ........... 2 pontos
--   apoio dado ........... 1 ponto
--
-- Faixas de nivel:
--   1  Novo por aqui        0-19
--   2  Cidadao ativo       20-99
--   3  Voz da comunidade  100-299
--   4  Guardiao da cidade 300+
--
-- Broncas em moderacao nao contam: so entram com moderation_status='approved',
-- senao daria para inflar o nivel enviando conteudo que nunca e publicado.

create or replace function public.get_user_level(target_user_id uuid)
returns table (
  points integer,
  level integer,
  label text,
  reports_count integer,
  updates_count integer,
  comments_count integer,
  upvotes_given integer
)
language sql
stable
as $$
  with counts as (
    select
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.moderation_status = 'approved')::integer as reports_count,
      (select count(*) from public.report_updates u
        where u.author_id = target_user_id)::integer as updates_count,
      (select count(*) from public.comments c
        where c.author_id = target_user_id)::integer as comments_count,
      (select count(*) from public.signatures s
        where s.user_id = target_user_id)::integer as upvotes_given
  ),
  scored as (
    select
      counts.*,
      (reports_count * 10
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
    upvotes_given
  from scored;
$$;

comment on function public.get_user_level(uuid) is
  'Nivel e pontos do usuario, calculados das contagens de broncas aprovadas, atualizacoes, comentarios e apoios.';

grant execute on function public.get_user_level(uuid) to anon, authenticated;
