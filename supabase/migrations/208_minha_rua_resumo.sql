-- 208_minha_rua_resumo.sql
--
-- O "resumo local" da seção 2 do plano: os números que transformam a página da
-- história de uma rua em Minha Rua.
--
--   Rua Pastor Domício Afonso dos Santos
--   Morada Nobre, PE
--   13 broncas · 9 resolvidas · 2 obras · Sem pavimentação · 37 fotos
--
-- POR QUE OS NÚMEROS SÃO GEOGRÁFICOS, E NÃO UM `street_id` EM `reports`
--
-- Uma coluna `street_id` em `reports` seria mais barata de consultar e estaria
-- errada quase sempre: ninguém escolhe a rua ao registrar uma bronca — escolhe
-- o ponto no mapa. A coluna teria que ser preenchida por um backfill
-- geográfico, ou seja, exatamente esta consulta, só que congelada no instante
-- do registro e nunca mais corrigida quando o traçado da rua fosse ajustado.
--
-- Derivado é a mesma escolha das migrações 169, 172, 174 e 198, e pelo mesmo
-- motivo: nada a estornar quando o dado de origem muda.
--
-- O RAIO É POR TRAÇADO, E CAI PARA O PONTO
--
-- A 203 deu traçado (`path`) às ruas. Com ele, "perto da rua" é 40 m de
-- qualquer ponto da linha — a largura de uma via com as duas calçadas, o que
-- pega o buraco do meio-fio e não pega a bronca da rua paralela.
--
-- Sem traçado sobra o ponto de `location`, e aí o raio precisa ser maior (150
-- m) porque o ponto é o centro aproximado de uma rua que pode ter 400 m. É uma
-- aproximação pior, e é por isso que a resposta diz qual das duas foi usada:
-- a tela consegue mostrar "aproximado" em vez de fingir precisão.

create or replace function public.get_street_summary(p_street_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rua        public.pavement_streets;
  v_area       extensions.geography;
  v_raio       double precision;
  v_preciso    boolean;
  v_broncas    integer := 0;
  v_resolvidas integer := 0;
  v_obras      integer := 0;
  v_fotos      integer := 0;
begin
  select * into v_rua from public.pavement_streets where id = p_street_id;
  if not found then return null; end if;

  if v_rua.path is not null then
    v_area := v_rua.path::extensions.geography;
    v_raio := 40;
    v_preciso := true;
  elsif v_rua.location is not null then
    v_area := v_rua.location::extensions.geography;
    v_raio := 150;
    v_preciso := false;
  else
    v_area := null;
    v_raio := 0;
    v_preciso := false;
  end if;

  if v_area is not null then
    select
      count(*) filter (where r.status <> 'duplicate'),
      count(*) filter (where r.status = 'resolved')
    into v_broncas, v_resolvidas
    from public.reports r
    where r.moderation_status = 'approved'
      and r.location is not null
      and extensions.st_dwithin(r.location::extensions.geography, v_area, v_raio);

    select count(*)
    into v_obras
    from public.public_works w
    where w.location is not null
      and extensions.st_dwithin(w.location::extensions.geography, v_area, v_raio);
  end if;

  -- As fotos da rua são as do acervo histórico dela (migração 197). Somar as
  -- fotos das broncas próximas inflaria o número com imagens de buraco que não
  -- são "fotos da rua" no sentido que a página promete.
  v_fotos := coalesce(jsonb_array_length(v_rua.historical_photos), 0);

  return jsonb_build_object(
    'street_id',   v_rua.id,
    'broncas',     coalesce(v_broncas, 0),
    'resolvidas',  coalesce(v_resolvidas, 0),
    'obras',       coalesce(v_obras, 0),
    'fotos',       v_fotos,
    'status',      v_rua.status,
    'preciso',     v_preciso,
    'raio_metros', v_raio
  );
end;
$$;

comment on function public.get_street_summary(uuid) is
  'Resumo local de Minha Rua: broncas, resolvidas, obras e fotos perto do traçado da rua.';

grant execute on function public.get_street_summary(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
