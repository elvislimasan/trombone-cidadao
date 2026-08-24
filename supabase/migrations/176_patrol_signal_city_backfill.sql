-- 176_patrol_signal_city_backfill.sql
--
-- BRONCA APROVADA COM city_id NULO
--
-- Sintoma: broncas vindas do modo patrulha chegavam à fila de moderação sem
-- cidade, eram aprovadas, e ficavam no banco com `city_id` nulo.
--
-- Causa: os dois caminhos de escrita da patrulha recebiam a cidade do SELETOR
-- DO MAPA — um filtro de visualização, que nasce nulo e que a tela de mapa nem
-- reavalia enquanto o modo patrulha está aberto. Quem entrasse em patrulha sem
-- ter escolhido cidade gravava tudo sem cidade.
--
-- O lado do cliente passou a resolver a cidade pelo GPS (`useNavStreet`), que é
-- o dado certo: a bronca pertence ao chão onde a pessoa está, não ao filtro que
-- ela deixou aberto. Esta migração fecha o que sobra do lado do servidor.
--
-- POR QUE ISSO NÃO É COSMÉTICO
--
-- `city_id` é a chave de escopo do app inteiro. Uma bronca sem cidade:
--   • some do painel do embaixador — a RLS dele é `is_ambassador_of(uid, city_id)`,
--     e com cidade nula ele não a vê nem para aprovar;
--   • cai no balde "sem cidade" dos clusters do mapa (migração 128);
--   • fica fora dos placares de cidade e de bairro (migração 174).
--
-- O QUE MUDA AQUI
--
-- `complete_patrol_signal` passa a aceitar cidade e bairro e a PREENCHER o que
-- estiver nulo na linha do sinal. Só o que estiver nulo: quem cumpre a missão
-- está no local e sabe onde está, mas quem sinalizou também estava — sobrescrever
-- trocaria um dado bom por outro igualmente bom, e abriria a porta para o ponto
-- corrigido levar a bronca para a cidade errada de propósito.
--
-- O contrário da 175 não muda: continua sendo impossível cumprir de longe.
--
-- AS LINHAS QUE JÁ ESTÃO NULAS
--
-- Não são corrigidas aqui. O Postgres não tem como resolver ponto → município:
-- `cities` guarda nome e UF, sem polígono (não há tabela de fronteiras), e
-- `match_city` casa por NOME. Chutar pela cidade do autor ou do bairro poria a
-- bronca na cidade errada — pior que nula, porque ninguém descobriria depois.
-- Quem resolve é o moderador, pela tela de moderação, que agora exige a cidade
-- antes de aprovar uma bronca sem ela.

drop function if exists public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision
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
  p_neighborhood text default null
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
  v_usuario extensions.geometry;
  v_corrigido extensions.geometry;
  v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'titulo obrigatorio' using errcode = '22023';
  end if;

  select r.location, r.author_id
    into v_origem, v_autor
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

  select coalesce(pr.is_admin, false) or coalesce(pr.is_master, false)
    into v_admin
  from public.profiles pr where pr.id = auth.uid();

  update public.reports r
  set title = btrim(p_title),
      description = coalesce(nullif(btrim(p_description), ''), r.description),
      location = coalesce(v_corrigido, r.location),
      -- Preenche o que faltou na sinalizacao. `coalesce` na ORDEM da linha
      -- primeiro: o que ja estava gravado vence sempre.
      city_id = coalesce(r.city_id, p_city_id),
      neighborhood = coalesce(r.neighborhood, nullif(btrim(p_neighborhood), '')),
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
  bigint, text
) to authenticated;

comment on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision,
  bigint, text
) is
  'Completa a missao de outro cidadao. `p_city_id`/`p_neighborhood` apenas '
  'PREENCHEM o que estiver nulo no sinal — nunca sobrescrevem.';

-- ── Fim ──────────────────────────────────────────────────────────────────────
