-- 175_patrol_missions_rules.sql
--
-- Tres ajustes de regra do modo patrulha, todos vindos do uso em campo:
--
--   1. Bronca com atualizacao recente sai do corredor. Alertar sobre um buraco
--      que alguem confirmou anteontem e pedir o mesmo trabalho duas vezes.
--   2. Quem sinalizou NAO cumpre a propria missao. Missao passa a ser sempre
--      validacao de terceiro.
--   3. Quem cumpre pode CORRIGIR o ponto. A sinalizacao e feita em movimento e
--      cai aproximada; quem chega a pe sabe onde o problema esta de fato.
--
-- O 2 e o 3 mudam decisoes da 173, e por isso a funcao e recriada aqui inteira.

-- ── Broncas ja atendidas ha pouco ────────────────────────────────────────────
--
-- Devolve, de uma lista de ids, os que receberam atualizacao na janela.
-- O cliente usa para tirar do corredor antes de alertar.
--
-- `security definer` de proposito: conta TAMBEM as atualizacoes em moderacao. O
-- que importa aqui nao e se um moderador ja aprovou, e se alguem ja foi ate la.
-- Uma atualizacao pendente significa exatamente isso, e ignora-la faria o app
-- mandar outra pessoa a mesma esquina enquanto a primeira espera revisao.
--
-- Nao vaza nada novo: quais broncas tem atualizacao recente ja e visivel na
-- pagina de cada bronca. A funcao so responde sobre ids que o chamador ja tem.
create or replace function public.reports_updated_recently(
  p_ids uuid[],
  p_dias integer default 2
)
returns table (report_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct u.report_id
  from public.report_updates u
  where u.report_id = any(coalesce(p_ids, '{}'::uuid[]))
    and u.created_at >= now() - make_interval(
          days => greatest(1, least(coalesce(p_dias, 2), 30))
        )
    -- Atualizacao rejeitada nao houve: o relato foi descartado, e a bronca
    -- continua precisando de quem passe por la.
    and coalesce(u.status, '') <> 'rejected';
$$;

grant execute on function public.reports_updated_recently(uuid[], integer) to authenticated;

-- ── Raio de ajuste do ponto ──────────────────────────────────────────────────

create or replace function public.patrol_signal_adjust_m()
returns double precision
language sql
immutable
as $$ select 100::double precision $$;

comment on function public.patrol_signal_adjust_m() is
  'Quanto o ponto de uma missao pode ser corrigido, em metros, a partir da marcacao original.';

grant execute on function public.patrol_signal_adjust_m() to authenticated;

-- ── Cumprir a missao (v2) ────────────────────────────────────────────────────
--
-- Substitui a versao da 173. Muda a assinatura (dois parametros novos), entao
-- precisa de drop: `create or replace` nao altera a lista de argumentos, e sem
-- o drop a antiga continuaria existindo como sobrecarga — com o PostgREST
-- escolhendo qual chamar pelo corpo do JSON, o que e o tipo de ambiguidade que
-- so aparece em producao.
--
-- O QUE MUDOU
--
-- (a) O AUTOR NAO CUMPRE A PROPRIA MISSAO.
--
--     Sinalizar e apontar; cumprir e provar. Quando a mesma pessoa faz os dois,
--     nao ha prova nenhuma — e o placar pagaria 3 + 12 pelo que um cadastro
--     normal paga 10, premiando quem passa pelo caminho mais longo.
--
--     O custo e real e aceito: num bairro sem outros usuarios, a missao pode
--     nunca ser cumprida. Quem quiser registrar a propria bronca completa tem o
--     caminho direto, sem passar por sinal.
--
-- (b) O PONTO PODE SER CORRIGIDO, DENTRO DE UM LIMITE.
--
--     A 173 travava a coordenada, para impedir "cumprir" de casa arrastando o
--     pin. O limite preserva essa garantia sem pagar o preco dela: a correcao
--     precisa ficar perto da marcacao ORIGINAL e perto de ONDE O USUARIO ESTA.
--     Continua sendo impossivel apontar para o outro lado da cidade, e passa a
--     ser possivel tirar o pin do meio da rua e coloca-lo na calcada certa.
drop function if exists public.complete_patrol_signal(
  uuid, text, text, double precision, double precision
);

create function public.complete_patrol_signal(
  p_signal_id uuid,
  p_title text,
  p_description text,
  p_lat double precision,
  p_lng double precision,
  p_new_lat double precision default null,
  p_new_lng double precision default null
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
  uuid, text, text, double precision, double precision, double precision, double precision
) to authenticated;

-- ── Sinal aberto nunca e publicado ───────────────────────────────────────────
--
-- O feed, o mapa e o "perto de mim" filtram por moderation_status='approved'.
-- A create_patrol_signal grava 'pending_approval' sem excecao — nem para admin,
-- nem para master —, e por isso o sinal ja nascia fora de tudo.
--
-- Mas isso era uma promessa do CODIGO. Esta constraint torna impossivel:
-- qualquer caminho que tente aprovar um sinal ainda aberto — a tela de
-- moderacao, um update manual pelo dashboard, uma funcao futura — falha.
--
-- Um sinal aberto nao tem foto, nao tem descricao e nao foi conferido por
-- ninguem. Publicar isso como bronca seria publicar um boato com a marca do
-- app. Depois de cumprido (signal_status='done') ele vira bronca de verdade,
-- com foto e autor do laudo, e a constraint sai da frente.
--
-- REPARO ANTES DA TRAVA
--
-- A primeira tentativa de aplicar esta migracao falhou com 23514: ja existiam
-- sinais abertos APROVADOS no banco. Nao vieram da create_patrol_signal, que
-- grava 'pending_approval' sem excecao — vieram das telas de moderacao.
--
-- A fila do moderador e a do embaixador buscam TODA linha com
-- moderation_status='pending_approval', e o sinal usa esse mesmo status para
-- ficar fora do feed. Os dois sentidos colidiram: o que mantinha o sinal
-- escondido era exatamente o que o colocava na fila de aprovacao — e aprovado,
-- ele aparecia no feed sem foto e sem descricao. E o que o usuario viu.
--
-- As duas telas passaram a filtrar sinal aberto (ModerationPage.jsx e
-- AmbassadorPage.jsx). Este update conserta o que ja tinha sido aprovado antes
-- do filtro existir.
--
-- Nao dispara notificacao: o gatilho de moderacao so avisa quando o status vira
-- 'rejected', e aqui ele volta para 'pending_approval'.
update public.reports
set moderation_status = 'pending_approval'
where origin = 'signal'
  and signal_status = 'open'
  and moderation_status = 'approved';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_sinal_aberto_nao_publica'
  ) then
    alter table public.reports
      add constraint reports_sinal_aberto_nao_publica check (
        not (
          origin = 'signal'
          and signal_status = 'open'
          and moderation_status = 'approved'
        )
      );
  end if;
end $$;
