-- 228 — Do numero da rua para o mapa daquela rua
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O PROBLEMA: UM NUMERO QUE LEVA A OUTRO CONJUNTO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A faixa de Minha Rua diz "7 broncas" e leva a `/mapa?cidade=N`. O numero e da
-- RUA; o destino e a CIDADE INTEIRA. Quem toca em "7 broncas" cai num mapa com
-- quinhentos pinos e nenhuma indicacao de quais eram os sete — e a leitura mais
-- natural do que aconteceu e que o app perdeu o filtro pelo caminho.
--
-- E o pior tipo de link: ele nao da erro. A pessoa fica procurando, desiste, e
-- da proxima vez nao toca mais no numero — que era o unico caminho que a pagina
-- da rua oferecia para ver as broncas dela no mapa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A SOLUCAO: A MESMA GEOMETRIA QUE JA CONTA, DEVOLVENDO OS IDS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `get_street_summary` (208) ja sabe o que e "perto desta rua": 40 m do tracado
-- quando ele existe, 150 m do ponto quando nao existe. Esta funcao usa
-- EXATAMENTE a mesma regra e devolve os ids em vez da contagem — e e por isso
-- que a lista sempre bate com o numero que foi clicado. Duas definicoes de
-- "perto" produziriam "7 broncas" abrindo uma lista de seis, que e a forma mais
-- rapida de a cidade parar de confiar no numero.
--
-- POR QUE UMA FUNCAO PARA BRONCAS E OBRAS JUNTAS
--
-- Porque a parte cara e comum: montar a area e decidir o raio. Duas funcoes
-- fariam esse trabalho duas vezes e teriam de manter a mesma copia da regra dos
-- 40/150 m. A tela usa a metade que lhe interessa.
--
-- O CENTRO VAI JUNTO
--
-- Sem ele o mapa abriria no recorte anterior e a pessoa teria de procurar a rua
-- que acabou de pedir. E o centroide do tracado (ou o proprio ponto), que e o
-- lugar de onde as duas pontas da rua cabem na tela.

create or replace function public.get_street_focus(p_street_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rua     public.pavement_streets;
  v_area    extensions.geography;
  v_raio    double precision;
  v_preciso boolean;
  v_centro  extensions.geometry;
  v_reports jsonb := '[]'::jsonb;
  v_works   jsonb := '[]'::jsonb;
begin
  select * into v_rua from public.pavement_streets where id = p_street_id;
  if not found then return null; end if;

  -- Mesma escada da 208, na mesma ordem e com os mesmos numeros.
  if v_rua.path is not null then
    v_area    := v_rua.path::extensions.geography;
    v_raio    := 40;
    v_preciso := true;
    v_centro  := extensions.st_centroid(v_rua.path);
  elsif v_rua.location is not null then
    v_area    := v_rua.location::extensions.geography;
    v_raio    := 150;
    v_preciso := false;
    v_centro  := v_rua.location;
  else
    v_area    := null;
    v_raio    := 0;
    v_preciso := false;
    v_centro  := null;
  end if;

  if v_area is not null then
    -- `moderation_status = 'approved'` e `status <> 'duplicate'` sao os mesmos
    -- recortes da contagem. Sem eles a lista traria broncas que o mapa nao
    -- desenha, e o numero da faixa deixaria de bater com o que abre.
    select coalesce(jsonb_agg(r.id), '[]'::jsonb)
    into v_reports
    from public.reports r
    where r.moderation_status = 'approved'
      and r.status <> 'duplicate'
      and r.location is not null
      and extensions.st_dwithin(r.location::extensions.geography, v_area, v_raio);

    select coalesce(jsonb_agg(w.id), '[]'::jsonb)
    into v_works
    from public.public_works w
    where w.location is not null
      and extensions.st_dwithin(w.location::extensions.geography, v_area, v_raio);
  end if;

  return jsonb_build_object(
    'street_id',  v_rua.id,
    'name',       v_rua.name,
    'city_id',    v_rua.city_id,
    'report_ids', v_reports,
    'work_ids',   v_works,
    'lat',        case when v_centro is null then null else extensions.st_y(v_centro) end,
    'lng',        case when v_centro is null then null else extensions.st_x(v_centro) end,
    -- A tela precisa dizer "contagem aproximada" pelo mesmo motivo da faixa:
    -- sem tracado, "perto da rua" e um circulo de 150 m que pega a vizinha.
    'preciso',    v_preciso
  );
end;
$$;

comment on function public.get_street_focus(uuid) is
  'Ids das broncas e obras perto de uma rua, mais o centro dela. Usa a MESMA regra de proximidade de get_street_summary (208) — se as duas divergirem, o numero da faixa deixa de bater com a lista que ele abre.';

grant execute on function public.get_street_focus(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
