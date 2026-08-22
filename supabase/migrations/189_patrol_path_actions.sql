-- 189_patrol_path_actions.sql
--
-- Os pontos de acao vao junto do percurso.
--
-- POR QUE NAO DA PARA DEDUZIR DOS IDS QUE JA EXISTEM
--
-- `patrols` guarda `confirmed_report_ids`, `registered_report_ids` e
-- `signaled_report_ids` — ids, nao coordenadas. Desenhar os pontos no mapa a
-- partir deles exigiria buscar cada bronca, e ai comeca o problema:
--
--   • as broncas registradas na patrulha nascem em moderacao, e uma que for
--     REJEITADA some da consulta — o mapa da patrulha perderia um ponto que
--     aconteceu de verdade, meses depois, sem aviso;
--   • sinal aberto tambem nao e legivel por qualquer um (ver a 187);
--   • e seria uma consulta a mais por patrulha, numa lista de vinte.
--
-- O que interessa aqui e onde a pessoa ESTAVA quando agiu. Isso e fato do
-- trajeto, nao da bronca: pertence ao percurso, e nao muda se a bronca for
-- rejeitada, editada ou apagada depois.
--
-- FORMATO
--
--   [{"lng": -38.57, "lat": -8.60, "t": "bronca"}, …]
--
-- `t` e um de: bronca (cadastro completo), missao (sinal de outra pessoa
-- cumprido), sinal (sinalizacao rapida), confirmacao (bronca ja existente
-- confirmada em campo). Cada um vira uma cor no tracado.
--
-- Chave curta de proposito: sao poucos pontos, mas a coluna inteira e lida a
-- cada abertura da lista.

alter table public.patrol_paths
  add column if not exists actions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'patrol_paths_actions_e_lista'
  ) then
    alter table public.patrol_paths
      add constraint patrol_paths_actions_e_lista
      check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 500);
  end if;
end $$;

comment on column public.patrol_paths.actions is
  'Onde a pessoa estava a cada acao: [{lng, lat, t}], t em (bronca, missao, sinal, confirmacao). Fato do trajeto, nao da bronca — sobrevive a rejeicao ou exclusao dela.';

-- ── Miniaturas da lista ─────────────────────────────────────────────────────
--
-- A lista do historico desenha o tracado de cada saida, como o Strava. Puxar a
-- coluna `path` inteira para isso seria caro a toa: sao ate 1200 pontos por
-- patrulha, vinte patrulhas por pagina — centenas de kB para desenhar figuras
-- de 100 pixels de largura, onde 48 pontos ja saturam o traco.
--
-- Esta funcao devolve o percurso PENEIRADO: um ponto a cada N, mais a ultima
-- ponta (que a peneira quase sempre descarta, e sem ela o traco termina antes
-- de chegar). As acoes vao inteiras — sao poucas, e cada uma e um ponto que a
-- pessoa reconhece.
--
-- SECURITY INVOKER: a RLS de patrol_paths continua valendo dentro dela, entao
-- pedir o id de outra pessoa nao devolve nada.
create or replace function public.get_patrol_thumbs(p_ids uuid[])
returns table (
  patrol_id uuid,
  path      jsonb,
  actions   jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    pp.patrol_id,
    coalesce(
      (
        select jsonb_agg(e.valor order by e.ord)
        from (
          select valor, ord
          from jsonb_array_elements(pp.path) with ordinality as x(valor, ord)
        ) e
        where (e.ord - 1) % greatest(1, (jsonb_array_length(pp.path) / 48)) = 0
           or e.ord = jsonb_array_length(pp.path)
      ),
      '[]'::jsonb
    ) as path,
    pp.actions
  from public.patrol_paths pp
  where pp.patrol_id = any(p_ids);
$$;

comment on function public.get_patrol_thumbs(uuid[]) is
  'Percurso peneirado (~48 pontos) + acoes, para as miniaturas do historico. Nunca use para o mapa cheio: ali o traco precisa da coluna inteira.';

grant execute on function public.get_patrol_thumbs(uuid[]) to authenticated;
