-- 177_patrol_category_fields.sql
--
-- Cumprir missao passa a exigir os campos da categoria.
--
-- O PROBLEMA
--
-- Uma bronca de iluminacao precisa do tipo do problema e do numero da plaqueta
-- do poste. O formulario comum cobra os dois desde sempre; a conclusao de
-- missao, criada na 173, gravava so titulo, descricao e ponto.
--
-- O resultado nao era uma bronca "quase completa" - era uma bronca inutil para
-- quem tem que consertar. "Tem um poste apagado nessa rua" obriga a
-- concessionaria a mandar alguem procurar; a plaqueta leva direto ao poste. E
-- ainda ocupava o lugar de um cadastro completo, porque a missao ja tinha sido
-- consumida e ninguem mais ia ate la.
--
-- POR QUE NO SERVIDOR TAMBEM
--
-- O modal passou a pedir os campos, e so isso resolveria o uso normal. Mas esta
-- funcao e `security definer` e escreve na linha de OUTRO usuario: ela e a
-- unica porta para essa escrita, e porta que confia no cliente nao e porta.
-- Mesma razao pela qual a distancia dos 100 m e conferida aqui.
--
-- CONTINUACAO DA 176
--
-- A 176 acrescentou `p_city_id`/`p_neighborhood`, que PREENCHEM o que ficou
-- nulo no sinal sem sobrescrever o que ja estava certo. Este arquivo recria a
-- funcao com aquele comportamento intacto e tres parametros a mais - recriar,
-- e nao substituir, porque `create or replace` nao muda lista de argumentos.
--
-- A LISTA DE CATEGORIAS FICA NO CLIENTE
--
-- Aqui so se cobra o que a categoria da linha exige, sem catalogo de categorias
-- no banco: `iluminacao` precisa de tipo e plaqueta, o resto nao precisa de
-- nada. Se outra categoria ganhar campo obrigatorio, este bloco cresce uma
-- condicao — e o cliente ja tem a regra em src/lib/reportCategoryFields.js.

drop function if exists public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision,
  bigint, text
);

create function public.complete_patrol_signal(
  p_signal_id uuid,
  p_title text,
  p_description text,
  p_lat double precision,
  p_lng double precision,
  p_new_lat double precision default null,
  p_new_lng double precision default null,
  p_city_id bigint default null,
  p_neighborhood text default null,
  p_issue_type text default null,
  p_pole_number text default null,
  p_is_from_water_utility boolean default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_origem extensions.geometry;
  v_autor uuid;
  v_categoria text;
  v_usuario extensions.geometry;
  v_corrigido extensions.geometry;
  v_admin boolean;
  v_tipo text;
  v_plaqueta text;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'titulo obrigatorio' using errcode = '22023';
  end if;

  select r.location, r.author_id, r.category_id
    into v_origem, v_autor, v_categoria
  from public.reports r
  where r.id = p_signal_id
    and r.origin = 'signal'
    and r.signal_status = 'open';

  if not found then
    raise exception 'missao indisponivel' using errcode = 'P0002';
  end if;

  if v_autor = auth.uid() then
    raise exception 'autor nao cumpre a propria missao' using errcode = 'P0001';
  end if;

  v_usuario := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  if extensions.st_distance(
       v_origem::extensions.geography,
       v_usuario::extensions.geography
     ) > public.patrol_signal_presence_m()
  then
    raise exception 'fora do local' using errcode = 'P0001';
  end if;

  -- Correcao do ponto: opcional. Sem ela, o ponto original permanece.
  if p_new_lat is not null and p_new_lng is not null then
    v_corrigido := extensions.st_setsrid(
      extensions.st_makepoint(p_new_lng, p_new_lat), 4326
    );

    if extensions.st_distance(
         v_origem::extensions.geography,
         v_corrigido::extensions.geography
       ) > public.patrol_signal_adjust_m()
    then
      raise exception 'ajuste longe da marcacao' using errcode = 'P0001';
    end if;

    -- E precisa estar perto de quem corrige: so se aponta para o que se ve.
    if extensions.st_distance(
         v_usuario::extensions.geography,
         v_corrigido::extensions.geography
       ) > public.patrol_signal_adjust_m()
    then
      raise exception 'ajuste longe de voce' using errcode = 'P0001';
    end if;
  end if;

  -- ── Campos da categoria ──
  v_tipo := nullif(btrim(coalesce(p_issue_type, '')), '');
  -- Mesma limpeza do cliente: a sugestao de poste vem como "12 - 34567" e o
  -- numero gravado precisa ser o da plaqueta fisica.
  v_plaqueta := nullif(
    btrim(regexp_replace(btrim(coalesce(p_pole_number, '')), '^\s*\d+\s*[-–—]\s*', '')),
    ''
  );

  if v_categoria = 'iluminacao' then
    if v_tipo is null then
      raise exception 'tipo do problema obrigatorio' using errcode = '22023';
    end if;
    if v_plaqueta is null then
      raise exception 'plaqueta obrigatoria' using errcode = '22023';
    end if;
  end if;

  select coalesce(pr.is_admin, false) or coalesce(pr.is_master, false)
    into v_admin
  from public.profiles pr where pr.id = auth.uid();

  update public.reports r
  set title = btrim(p_title),
      description = coalesce(nullif(btrim(p_description), ''), r.description),
      location = coalesce(v_corrigido, r.location),
      -- Preenche o que faltou na sinalizacao. `coalesce` na ORDEM da linha
      -- primeiro: o que ja estava gravado vence sempre. (176)
      city_id = coalesce(r.city_id, p_city_id),
      neighborhood = coalesce(r.neighborhood, nullif(btrim(p_neighborhood), '')),
      issue_type = case when v_categoria = 'iluminacao' then v_tipo else null end,
      pole_number = case when v_categoria = 'iluminacao' then v_plaqueta else null end,
      -- As tres colunas guardam a mesma plaqueta por caminhos diferentes de
      -- cadastro; o formulario comum preenche assim, e divergir faria a mesma
      -- bronca aparecer identificada numa tela e sem identificacao em outra.
      reported_post_identifier =
        case when v_categoria = 'iluminacao' then v_plaqueta else null end,
      reported_plate =
        case when v_categoria = 'iluminacao' then v_plaqueta else null end,
      is_from_water_utility =
        case when v_categoria = 'buracos'
             then coalesce(p_is_from_water_utility, false)
             else null end,
      signal_status = 'done',
      completed_by = auth.uid(),
      completed_at = now(),
      -- Volta para a fila normal: uma bronca que veio de missao nao merece
      -- menos revisao que qualquer outra.
      moderation_status = case when coalesce(v_admin, false) then 'approved' else 'pending_approval' end
  where r.id = p_signal_id;

  return p_signal_id;
end $$;

grant execute on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision,
  bigint, text, text, text, boolean
) to authenticated;

comment on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision,
  bigint, text, text, text, boolean
) is
  'Completa a missao de outro cidadao. Exige os campos obrigatorios da categoria '
  '(iluminacao: tipo e plaqueta). `p_city_id`/`p_neighborhood` apenas PREENCHEM '
  'o que estiver nulo no sinal — nunca sobrescrevem.';
