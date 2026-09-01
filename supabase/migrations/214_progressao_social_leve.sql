-- 214_progressao_social_leve.sql
--
-- Fase 4 do roadmap revisado (secao 36.14).
--
-- ESTA FASE NASCE ATRAS DE UM PORTAO, E ISSO ESTA NO PLANO
--
-- "So abre se as fases anteriores mostrarem retorno significativo" (36.14), e a
-- 36.15 lista os criterios: contribuicao util e ciclo fechado melhorando,
-- qualidade e reversoes nao piorando, efeito nao concentrado nos mais ativos,
-- cobertura de areas subamostradas nao piorando.
--
-- Nada disso foi medido — as migracoes 205 a 213 sao recentes. Entao o que este
-- arquivo cria fica DESLIGADO por padrao: campanhas nascem em rascunho, a
-- comparacao entre bairros nasce falsa, e as conquistas novas so aparecem para
-- quem ja tem o numero. Ligar e uma decisao de produto tomada com dado na mao,
-- nao um efeito colateral de aplicar a migracao.
--
-- O QUE ESTA FASE NAO FAZ, E POR QUE ISSO E METADE DO TRABALHO
--
-- Fora do roadmap (36.14): Trombone Coins, loja, caixas e loot, passe de
-- temporada, premio por volume, missao patrocinada, territorio individual e
-- ranking global permanente. Nenhuma tabela aqui tem preco, saldo, sorteio ou
-- classificacao geral — e a ausencia e o desenho, nao uma etapa futura.
--
-- "Progressao social LEVE" e o adjetivo que decide tudo: reconhecimento sem
-- moeda, marco sem vantagem, comparacao sem ranking.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 — CONTADORES DE QUALIDADE E MENTORIA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUE UMA RPC NOVA, E NAO MAIS COLUNAS EM get_mission_counters
--
-- Aquela funcao ja devolve 27 colunas e precisa de drop+create para mudar de
-- assinatura (a 200 documenta o porque: duas sobrecargas confundem o PostgREST).
-- Acrescentar quatro colunas exigiria reescrever 250 linhas de CTEs para nao
-- mudar nenhuma delas — muito risco por nenhum ganho.
--
-- `useMissions` ja faz tres chamadas em paralelo. Uma quarta e barata, e mantem
-- separada uma pergunta que e de outra natureza: as outras contam VOLUME, esta
-- conta QUALIDADE.
--
-- POR QUE QUALIDADE PRECISA DE DENOMINADOR
--
-- "20 atualizacoes aceitas" nao diz nada sobre qualidade: quem mandou 400 e teve
-- 380 recusadas tambem tem 20. A conquista precisa da taxa, e taxa precisa dos
-- dois numeros — por isso `aceitas` e `rejeitadas` vem separadas, e a regra de
-- corte mora em src/lib/patrolGame.js, onde as outras moram.
--
-- MENTORIA E "FAZER A CONTRIBUICAO DE OUTRA PESSOA VALER"
--
-- Nao ha tutoria formal neste produto, e inventar uma (badge de "mentor" por
-- mandar mensagem) mediria conversa, nao ajuda. O que existe e melhor: quem
-- completa o sinal de alguem transforma um ponto solto em bronca de verdade, e
-- quem confirma a bronca de alguem faz a verificacao daquela pessoa fechar.
--
-- `pessoas_ajudadas` conta AUTORES DISTINTOS, nao acoes: ajudar dez vezes a
-- mesma pessoa e outra coisa — e contar acoes faria a medalha de mentoria virar
-- mais uma medalha de volume, que e o oposto do que a fase 4 pede.

create or replace function public.get_quality_counters(target_user_id uuid)
returns table (
  updates_aceitas      integer,
  updates_rejeitadas   integer,
  sugestoes_aprovadas  integer,
  pessoas_ajudadas     integer
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select
    (
      select count(*)::integer
      from public.report_updates u
      where u.author_id = target_user_id
        and coalesce(u.status, '') <> 'rejected'
    ),
    (
      select count(*)::integer
      from public.report_updates u
      where u.author_id = target_user_id
        and u.status = 'rejected'
    ),
    (
      select count(*)::integer
      from public.pavement_suggestions g
      where g.user_id = target_user_id
        and g.status = 'aprovada'
    ),
    (
      select count(distinct autor)::integer
      from (
        -- Completou o sinal de outra pessoa: o ponto solto dela virou bronca.
        select r.author_id as autor
        from public.reports r
        where r.completed_by = target_user_id
          and r.author_id is not null
          and r.author_id <> target_user_id

        union

        -- Confirmou em campo a bronca de outra pessoa: a verificacao dela andou.
        select r.author_id
        from public.report_updates u
        join public.reports r on r.id = u.report_id
        where u.author_id = target_user_id
          and coalesce(u.status, '') <> 'rejected'
          and r.author_id is not null
          and r.author_id <> target_user_id
      ) ajudados
    );
$fn$;

comment on function public.get_quality_counters(uuid) is
  'Contadores de QUALIDADE (aceitas x rejeitadas, sugestoes aprovadas) e de MENTORIA (autores distintos que a pessoa ajudou). Separada de get_mission_counters porque conta natureza diferente: aquela conta volume, esta conta se o volume prestou.';

grant execute on function public.get_quality_counters(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 — CAMPANHAS SAZONAIS EDITORIAIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "EDITORIAIS" E A PALAVRA QUE DEFINE A TABELA
--
-- Uma campanha nao e gerada por regra, nao roda sozinha e nao se repete porque o
-- calendario virou. Alguem decide que faz sentido falar de bueiro entupido antes
-- da chuva, escreve o texto, escolhe o periodo e assina. Sem autor, campanha
-- vira notificacao sazonal automatica — que e propaganda com data.
--
-- POR QUE NAO HA "RECOMPENSA DE CAMPANHA"
--
-- Premio por volume esta fora do roadmap (36.14), e campanha com premio e
-- premio por volume com tema. O que a campanha oferece e ATENCAO: ela diz o que
-- e util agora, e o util continua pagando o que sempre pagou.
--
-- POR QUE `categoria_id` E NAO UMA LISTA DE BRONCAS
--
-- Campanha aponta um TIPO de problema num periodo, nao um conjunto fixo de
-- casos. Uma lista de broncas envelheceria em dois dias — as broncas do tema
-- aparecem por consulta, e as que nascerem durante a campanha entram sozinhas.

create table if not exists public.campaigns (
  id           bigint generated by default as identity primary key,
  city_id      bigint references public.cities(id) on delete cascade,

  titulo       text not null,
  chamada      text,
  corpo        text,

  categoria_id text references public.categories(id) on delete set null,

  inicio       date not null,
  fim          date not null,

  status       text not null default 'rascunho',

  -- Quem assina. Nao e auditoria: e o que separa editorial de automatico.
  editor_id    uuid references public.profiles(id) on delete set null,

  created_at   timestamptz not null default now(),

  constraint campaigns_status_valido check (status in ('rascunho', 'publicada', 'encerrada')),
  constraint campaigns_periodo_valido check (fim >= inicio),
  constraint campaigns_titulo_nao_vazio check (length(btrim(titulo)) > 0),
  -- Publicada sem autor e sem chamada seria exatamente a "notificacao sazonal
  -- automatica" que a tabela existe para nao ser.
  constraint campaigns_publicada_tem_autoria check (
    status = 'rascunho'
    or (editor_id is not null and length(btrim(coalesce(chamada, ''))) > 0)
  ),
  -- Uma campanha nao dura o ano inteiro. Sazonal que nunca acaba e so mais um
  -- banner permanente, e banner permanente deixa de ser lido na segunda semana.
  constraint campaigns_duracao_sazonal check (fim - inicio <= 92)
);

comment on table public.campaigns is
  'Campanha sazonal EDITORIAL: alguem escreve, assina e define o periodo. Nao gera recompensa propria — premio por volume esta fora do roadmap (36.14).';
comment on column public.campaigns.editor_id is
  'Quem assina a campanha. Sem autor, campanha vira notificacao sazonal automatica.';

create index if not exists campaigns_vigentes_idx
  on public.campaigns (city_id, status, inicio, fim)
  where status = 'publicada';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 — METAS COOPERATIVAS RECORRENTES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SEM JOB NOTURNO, PELO MESMO MOTIVO DAS DIARIAS
--
-- A 200 documenta a escolha: o sorteio das diarias e deterministico e derivado,
-- e nao ha o que gravar quando a regra reproduz o resultado. Aqui a situacao e
-- outra — uma meta tem titulo, area e prazo escolhidos por alguem — mas a
-- conclusao e a mesma sobre AUTOMACAO: nao existe cron neste projeto, e criar
-- um para abrir o ciclo seguinte adicionaria uma peca de infraestrutura para
-- economizar um clique do embaixador.
--
-- `recorrencia` diz que a meta se repete e com que passo. `ciclo` numera a
-- rodada. Repetir e uma acao explicita que copia a meta para o proximo ciclo —
-- o que tambem permite ajustar o alvo entre rodadas, que e o que qualquer
-- organizador faria de qualquer forma.
--
-- POR QUE A COMPARACAO NASCE DESLIGADA
--
-- A 36.7 autoriza um piloto controlado de comparacao entre times, nao uma
-- batalha de bairros. `timesComparaveis` (src/lib/metaComunitaria.js) recusa
-- grupos de tamanhos muito diferentes — mas a primeira guarda e esta coluna:
-- por padrao ninguem compara ninguem.

alter table public.community_goals
  add column if not exists recorrencia text,
  add column if not exists ciclo integer not null default 1,
  add column if not exists meta_anterior_id bigint references public.community_goals(id) on delete set null,
  add column if not exists comparacao_entre_bairros boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_goals_recorrencia_valida'
      and conrelid = 'public.community_goals'::regclass
  ) then
    alter table public.community_goals
      add constraint community_goals_recorrencia_valida
      check (recorrencia is null or recorrencia in ('mensal', 'trimestral'));
  end if;
end $$;

comment on column public.community_goals.recorrencia is
  'Nula = meta unica. mensal/trimestral = cooperativa recorrente; o proximo ciclo e criado por acao do embaixador, nao por cron (este projeto nao tem um).';
comment on column public.community_goals.comparacao_entre_bairros is
  'Falsa por padrao. Ligar e decisao editorial, e ainda assim src/lib/metaComunitaria.js recusa comparar bairros de tamanhos muito diferentes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 — RLS E GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.campaigns enable row level security;

-- Campanha publicada e conteudo publico; rascunho e de quem escreve.
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select using (
    status <> 'rascunho'
    or editor_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or (city_id is not null and public.is_ambassador_of(auth.uid(), city_id))
  );

drop policy if exists campaigns_editor_write on public.campaigns;
create policy campaigns_editor_write on public.campaigns
  for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or (city_id is not null and public.is_ambassador_of(auth.uid(), city_id))
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or (city_id is not null and public.is_ambassador_of(auth.uid(), city_id))
  );

grant select on public.campaigns to anon;
grant select, insert, update on public.campaigns to authenticated;
grant usage, select on sequence public.campaigns_id_seq to authenticated;

notify pgrst, 'reload schema';
