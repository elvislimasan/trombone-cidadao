-- 222_canal_do_orgao.sql
--
-- O encaminhamento deixa de depender de alguem lembrar de digitar.
--
-- O QUE EXISTIA
--
-- A 207 criou `report_official_steps` e um formulario dentro da bronca. Funciona
-- e continua funcionando — mas depende de um embaixador abrir cada bronca, uma
-- por uma, e registrar que o oficio saiu. Na pratica isso significa que a etapa
-- so aparece nas broncas que alguem teve tempo de tratar, e o cidadao le
-- "ainda nao ha registro de encaminhamento" numa cidade onde a prefeitura ate
-- recebeu a demanda.
--
-- O QUE ESTE ARQUIVO CRIA
--
-- Um canal por secretaria: e-mail, categorias sob responsabilidade dela, e dois
-- relatorios automaticos.
--
--   • semanal — as broncas pendentes que esta secretaria AINDA NAO VIU. E a
--     caixa de entrada dela: "chegou isto". (Nao e uma janela de sete dias, e
--     `relatorio_do_orgao` explica por que nao pode ser.)
--   • mensal  — TODAS as pendentes daquelas categorias, incluindo as que ja
--     foram enviadas antes. E o passivo: "isto tudo continua aberto".
--
-- E DAI SAI A ETAPA `encaminhada` — MAS SO COM PROVA
--
-- A 207 foi escrita em cima de uma ideia: "encaminhada" sem nada checavel e uma
-- palavra que alguem digitou. Um envio automatico poderia ser exatamente isso —
-- o app afirmando encaminhamento porque chamou uma API.
--
-- Por isso a etapa NAO nasce do envio. Ela nasce do evento `email.delivered` do
-- provedor, que e a afirmacao de um terceiro de que a mensagem entrou na caixa
-- do destinatario, guardada crua em `orgao_envio_eventos`. Bounce nao gera
-- etapa nenhuma — gera desativacao do canal e aviso a quem o cadastrou.
--
-- E `recebida` exige mais ainda: um clique humano no link unico que vai no
-- e-mail. Entrega prova que a mensagem chegou; so o clique prova que alguem do
-- outro lado a tratou como demanda. Sao duas provas diferentes e viram duas
-- etapas diferentes, como a 207 ja previa.
--
-- COBRANCA NAO VIRA ETAPA
--
-- Uma bronca de setembro ainda pendente reaparece no mensal de outubro, de
-- novembro, de dezembro. Nenhuma dessas reinclusoes grava etapa nova: seria um
-- aviso mensal, para todos os participantes de toda bronca aberta, sem noticia
-- nenhuma dentro. A reinclusao fica em `orgao_envio_itens`, e a tela mostra
-- "cobrada 4x desde 03/09" — informacao, sem notificacao.
--
-- O `status` DA BRONCA NAO E TOCADO
--
-- Mesma disciplina da 207: `reports.status` nao distingue "o oficio saiu" de
-- "a prefeitura respondeu", e mover para 'in-progress' porque um e-mail foi
-- entregue faria o mapa inteiro afirmar execucao que ninguem viu.
--
-- AS POLICIES ESTAO AQUI, DE PROPOSITO
--
-- Mesma preocupacao da 206 e da 207: neste projeto as policies moram no painel
-- do Supabase e nao no git. Toda policy das tabelas novas esta neste arquivo.

-- `net.http_post` e como o banco chama a Edge Function de envio. A 220 ja cria
-- esta extensao, mas repetir e barato e torna este arquivo aplicavel sozinho num
-- ambiente novo — que e exatamente o caso do DEV recriado do zero.
create extension if not exists pg_net with schema extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 — QUEM PODE FALAR PELA CIDADE COM A PREFEITURA
-- ═══════════════════════════════════════════════════════════════════════════

-- Nao reaproveita `pode_registrar_etapa_oficial` de proposito, pelo mesmo
-- motivo que aquela nao reaproveitou `can_manage_city_events`: a pergunta e
-- outra. Aquela responde "pode registrar o que o orgao fez NESTA bronca"; esta
-- responde "pode cadastrar o canal de e-mail DESTA cidade" — e o canal nao tem
-- bronca.
create or replace function public.pode_gerir_canal_do_orgao(p_user uuid, p_city_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
begin
  if p_user is null or p_city_id is null then return false; end if;
  if public.is_admin(p_user) or public.is_master(p_user) then return true; end if;
  return public.is_ambassador_of(p_user, p_city_id);
end;
$fn$;

comment on function public.pode_gerir_canal_do_orgao(uuid, bigint) is
  'Admin, master ou embaixador da cidade. Quem conhece a prefeitura e quem cadastra o canal — mas ativar e outra pergunta (ver orgao_canais.ativo).';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 — O CANAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUE `ativo` COMECA FALSO E SO ADMIN MUDA
--
-- O risco aqui nao e teorico: um endereco errado, pessoal ou desatualizado faz
-- o app mandar dezenas de broncas para o lugar errado e depois gravar
-- 'encaminhada' em cima disso — numa tabela que nao tem delete. O embaixador
-- cadastra porque e ele quem conhece a prefeitura; um admin confere antes do
-- primeiro envio porque o custo de errar recai sobre a credibilidade da
-- plataforma inteira, nao sobre a cidade sozinha.
--
-- POR QUE `reply_to` E OBRIGATORIO
--
-- Prefeitura pequena responde e-mail respondendo o e-mail. Se o remetente for
-- no-reply, "isso e da Compesa" e "ja esta na programacao" caem no vazio — e
-- essas duas frases sao exatamente o dado que a linha do tempo quer. A resposta
-- vai para quem tem como agir sobre ela: o embaixador da cidade.
--
-- POR QUE UUID E NAO IDENTITY
--
-- `id bigint` chega ao JSON do PostgREST como STRING, e este projeto ja perdeu
-- dois bugs de `city_id` NULL por causa disso. Onde o id vai atravessar para o
-- JavaScript, uuid nao tem essa armadilha.

create table if not exists public.orgao_canais (
  id            uuid primary key default gen_random_uuid(),
  city_id       bigint not null references public.cities(id) on delete cascade,

  nome          text not null,
  email         text not null,
  emails_copia  text[] not null default '{}',
  reply_to      text not null,

  ativo         boolean not null default false,
  ativado_por   uuid references public.profiles(id) on delete set null,
  ativado_em    timestamptz,

  -- Preenchido quando um bounce duro ou uma reclamacao de spam derruba o canal.
  -- Fica visivel na tela de cadastro: um canal desligado sem motivo aparente e
  -- um canal que alguem religa no dia seguinte com o mesmo endereco quebrado.
  desativado_motivo text,
  desativado_em     timestamptz,

  criado_por    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint orgao_canais_nome_nao_vazio check (length(btrim(nome)) > 2),
  constraint orgao_canais_email_plausivel check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  constraint orgao_canais_reply_to_plausivel check (reply_to ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  constraint orgao_canais_ativo_tem_quem check (
    (ativo is false) or (ativado_por is not null and ativado_em is not null)
  )
);

comment on table public.orgao_canais is
  'Uma secretaria (ou autarquia) e como falar com ela. Nasce inativa: embaixador cadastra, admin confere e ativa. Nenhum envio sai de canal inativo.';
comment on column public.orgao_canais.reply_to is
  'E-mail do embaixador. A secretaria responde "isso e da Compesa" respondendo o e-mail, e essa resposta precisa chegar em alguem que possa registrar a etapa certa.';
comment on column public.orgao_canais.desativado_motivo is
  'Por que o canal caiu. Preenchido automaticamente por bounce duro e por reclamacao de spam.';

create index if not exists orgao_canais_por_cidade_idx
  on public.orgao_canais (city_id) where ativo;

-- ── O mapeamento categoria -> secretaria ────────────────────────────────────
--
-- UMA CATEGORIA TEM UM UNICO RESPONSAVEL POR CIDADE
--
-- E o que o indice unico garante. Duas secretarias para a mesma categoria
-- pareceria mais flexivel e produziria dois encaminhamentos concorrentes para
-- o mesmo problema, dois avisos e nenhuma resposta a "quem devia ter feito?".
-- Quando mais de um orgao precisa ver, o caminho e `emails_copia` — que e como
-- o mundo real ja resolve isso (ouvidoria e gabinete em copia).
--
-- `city_id` desnormalizado existe SO para este indice: sem ele, a unicidade
-- por cidade nao e expressavel numa constraint.

create table if not exists public.orgao_categorias (
  canal_id    uuid not null references public.orgao_canais(id) on delete cascade,
  city_id     bigint not null references public.cities(id) on delete cascade,
  category_id text not null references public.categories(id) on delete cascade,

  primary key (canal_id, category_id)
);

create unique index if not exists orgao_categorias_um_responsavel_por_categoria
  on public.orgao_categorias (city_id, category_id);

comment on table public.orgao_categorias is
  'Que categorias cada secretaria responde. Indice unico por (cidade, categoria): sempre existe UM responsavel, nunca dois.';
comment on column public.orgao_categorias.city_id is
  'Desnormalizado da 1:N com orgao_canais. Existe unicamente para o indice unico por cidade — mantido em sincronia pelo gatilho abaixo.';

-- O `city_id` da categoria e sempre o do canal. Deixar o cliente informar seria
-- criar a possibilidade de um mapeamento apontando para outra cidade.
create or replace function public.orgao_categoria_herda_cidade()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  select c.city_id into new.city_id from public.orgao_canais c where c.id = new.canal_id;
  if new.city_id is null then
    raise exception 'canal % nao existe', new.canal_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists a_orgao_categoria_herda_cidade on public.orgao_categorias;
create trigger a_orgao_categoria_herda_cidade
before insert or update on public.orgao_categorias
for each row execute function public.orgao_categoria_herda_cidade();

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 — O ENVIO, O QUE FOI DENTRO DELE, E O QUE O PROVEDOR DISSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O INDICE UNICO E A PECA CENTRAL
--
-- `(canal_id, periodo, referencia)` e o que faz retentativa de cron, clique
-- duplo no botao manual e duas instancias concorrentes produzirem UM e-mail.
-- Sem ele, a idempotencia teria que morar no codigo de envio, que e o pior
-- lugar possivel para ela — o codigo que ja falhou uma vez e o que vai tentar
-- de novo.
--
-- POR QUE `token` E SEPARADO DO `id`
--
-- O `id` aparece em log, em resposta de API e na tela de admin. O `token` so
-- existe dentro do e-mail e e o que autoriza confirmar recebimento sem login.
-- Se fossem o mesmo valor, todo lugar que mostra o envio passaria a distribuir
-- a autorizacao de confirmar por ele.

create table if not exists public.orgao_envios (
  id            uuid primary key default gen_random_uuid(),
  canal_id      uuid not null references public.orgao_canais(id) on delete cascade,

  periodo       text not null,
  referencia    date not null,

  token         uuid not null default gen_random_uuid(),

  total_broncas integer not null default 0,
  status        text not null default 'pendente',

  disparado_em  timestamptz,
  tentativas    integer not null default 0,
  enviado_em    timestamptz,
  entregue_em   timestamptz,
  falhou_em     timestamptz,
  falha_motivo  text,

  provider_message_id text,

  confirmado_em       timestamptz,
  protocolo_informado text,

  created_at    timestamptz not null default now(),

  constraint orgao_envios_periodo_valido check (periodo in ('semanal', 'mensal')),
  constraint orgao_envios_status_valido check (status in (
    'pendente', 'enfileirado', 'enviado', 'entregue', 'falhou', 'recusado'
  ))
);

-- Coluna de uma versao anterior deste mesmo arquivo, que chegou a ser aplicada
-- numa tentativa interrompida. Nada a escrevia. `if exists` faz disto um no-op
-- em instalacao nova.
alter table public.orgao_envios drop column if exists confirmado_ip;

create unique index if not exists orgao_envios_um_por_periodo
  on public.orgao_envios (canal_id, periodo, referencia);

create unique index if not exists orgao_envios_token_idx
  on public.orgao_envios (token);

create index if not exists orgao_envios_por_provider_idx
  on public.orgao_envios (provider_message_id) where provider_message_id is not null;

create index if not exists orgao_envios_a_disparar_idx
  on public.orgao_envios (status, disparado_em) where status in ('pendente', 'enfileirado');

comment on table public.orgao_envios is
  'Um relatorio enviado a uma secretaria. O indice unico (canal, periodo, referencia) e o que impede retentativa de virar e-mail duplicado.';
comment on column public.orgao_envios.referencia is
  'Inicio do periodo coberto: a segunda-feira da semana, ou o dia 1 do mes. E a chave de deduplicacao e o que aparece no assunto do e-mail.';
comment on column public.orgao_envios.token is
  'Segredo do link de confirmacao. Nunca sai em RPC de leitura — quem ve o envio no admin nao pode confirmar recebimento no lugar do orgao.';
comment on column public.orgao_envios.status is
  'pendente -> enfileirado (pg_net chamou a funcao) -> enviado (provedor aceitou) -> entregue (provedor confirmou a caixa). falhou/recusado sao terminais.';

-- ── As broncas que foram naquele envio ──────────────────────────────────────

create table if not exists public.orgao_envio_itens (
  id           bigint generated by default as identity primary key,
  envio_id     uuid not null references public.orgao_envios(id) on delete cascade,
  report_id    uuid not null references public.reports(id) on delete cascade,

  -- Calculado na montagem: esta bronca ja foi para esta secretaria antes?
  -- E o que separa "novo" de "cobranca" no corpo do e-mail.
  primeira_vez boolean not null default true,

  -- Marcado pela funcao de entrega quando ESTE item gerou a etapa
  -- 'encaminhada'. Sem ele, "a bronca tem etapa" e "este envio a produziu"
  -- seriam indistinguiveis na auditoria.
  virou_etapa  boolean not null default false,

  created_at   timestamptz not null default now()
);

create unique index if not exists orgao_envio_itens_um_por_envio
  on public.orgao_envio_itens (envio_id, report_id);

create index if not exists orgao_envio_itens_por_bronca_idx
  on public.orgao_envio_itens (report_id);

comment on table public.orgao_envio_itens is
  'Quais broncas foram em qual relatorio. E daqui que sai "cobrada 4x desde 03/09" sem gerar etapa nem notificacao a cada cobranca.';

-- ── O rastro cru do provedor ────────────────────────────────────────────────
--
-- Append-only, como toda tabela de proveniencia deste projeto. Guarda o payload
-- inteiro porque a pergunta que uma auditoria faz seis meses depois nunca e a
-- que estava prevista quando as colunas foram escolhidas.

create table if not exists public.orgao_envio_eventos (
  id          bigint generated by default as identity primary key,
  envio_id    uuid not null references public.orgao_envios(id) on delete cascade,

  tipo        text not null,
  payload     jsonb,
  ocorrido_em timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint orgao_envio_eventos_tipo_valido check (tipo in (
    'enviado', 'entregue', 'adiado', 'devolvido', 'reclamacao', 'aberto', 'clicado', 'erro'
  ))
);

create index if not exists orgao_envio_eventos_por_envio_idx
  on public.orgao_envio_eventos (envio_id, ocorrido_em desc);

comment on table public.orgao_envio_eventos is
  'O que o provedor de e-mail disse, cru. E a prova por tras da etapa: "entregue" aqui e o unico fato que autoriza gravar encaminhamento.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 — CONFIGURACAO DA FUNCAO DE ENVIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mesma forma e mesmo motivo da 221: `current_setting` so vale para conexoes
-- novas e o pooler segura conexao velha por muito tempo, entao o valor chega
-- como NULL exatamente onde importa. Uma linha numa tabela nao tem esse
-- problema.

create table if not exists public.integracao_orgao (
  id           boolean primary key default true,
  function_url text,
  secret       text,
  updated_at   timestamptz not null default now(),

  constraint integracao_orgao_uma_linha_so check (id)
);

comment on table public.integracao_orgao is
  'Uma linha: para onde mandar o relatorio e com que segredo. Sem policy de RLS — so as funcoes SECURITY DEFINER leem.';

alter table public.integracao_orgao enable row level security;
revoke all on public.integracao_orgao from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 — O QUE VAI NO RELATORIO
-- ═══════════════════════════════════════════════════════════════════════════

-- O inicio do periodo que um disparo de hoje cobre.
--
-- semanal: a segunda-feira da semana que ACABOU. O disparo e na segunda de
-- manha e o recorte e segunda-a-domingo anterior — nao a semana em curso, que
-- teria dois dias de dado.
--
-- mensal: o dia 1 do mes ANTERIOR. O disparo e no dia 1 e o assunto do e-mail
-- diz "agosto/2026", que e o mes de que se esta falando.
create or replace function public.referencia_do_periodo(p_periodo text, p_em timestamptz default now())
returns date
language sql
immutable
as $fn$
  select case p_periodo
    when 'semanal' then (date_trunc('week', p_em) - interval '7 days')::date
    when 'mensal'  then (date_trunc('month', p_em) - interval '1 month')::date
  end;
$fn$;

comment on function public.referencia_do_periodo(text, timestamptz) is
  'O periodo que um disparo de agora cobre: a semana que acabou, ou o mes que acabou. Nunca o periodo em curso.';

-- As broncas que entram no relatorio de um canal.
--
-- POR QUE O SEMANAL NAO E UMA JANELA DE SETE DIAS
--
-- A primeira versao desta funcao recortava por data: "aprovadas entre segunda e
-- domingo". Nao funciona, e o motivo esta no proprio esquema — `reports` NAO
-- guarda data de aprovacao (o comentario de `eventoDeModeracao` em
-- src/lib/reportTimeline.js documenta a ausencia; a coluna `approved_at` que
-- existe neste banco e de `poles`, da migracao 095).
--
-- Com janela sobre `created_at`, uma bronca escrita no domingo e aprovada na
-- terca cai num buraco permanente: no disparo de segunda ela ainda estava
-- pendente de moderacao e foi excluida, e na segunda seguinte ela ja saiu da
-- janela. Ela nunca seria enviada — e o relatorio semanal ficaria em silencio
-- exatamente sobre as broncas que demoraram a ser moderadas.
--
-- O criterio que substitui a data e mais simples e diz melhor o que o relatorio
-- e: semanal = o que esta pendente e AINDA NAO FOI para esta secretaria. E a
-- caixa de entrada dela, definida pelo que ela ja viu, e nao por um calendario
-- que o app nao tem como conferir. Aprovacao tardia entra na semana seguinte em
-- vez de sumir, e nada e enviado duas vezes.
--
-- Efeito colateral aceito: o PRIMEIRO relatorio de um canal recem-ativado leva
-- o passivo inteiro daquelas categorias. E o correto — a secretaria nunca viu
-- nenhuma delas — e e uma vez so.
--
-- POR QUE O MENSAL NAO TEM RECORTE NENHUM
--
-- Porque a pergunta dele nao e "o que chegou": e "o que continua aberto". Uma
-- bronca de marco ainda pendente pertence ao relatorio de agosto tanto quanto
-- uma de agosto — e e justamente ela que o relatorio existe para cobrar.
--
-- NAO HA PARAMETRO DE REFERENCIA AQUI
--
-- O periodo (`referencia`) identifica o envio e e a chave de deduplicacao em
-- `orgao_envios`; ele nao filtra bronca nenhuma. Recebe-lo aqui daria a
-- impressao de que filtra.
drop function if exists public.relatorio_do_orgao(uuid, text, date);

create or replace function public.relatorio_do_orgao(
  p_canal   uuid,
  p_periodo text
)
returns table (
  report_id    uuid,
  titulo       text,
  endereco     text,
  categoria    text,
  criada_em    timestamptz,
  dias_aberta  integer,
  apoios       integer,
  primeira_vez boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with candidatas as (
    select
      r.id, r.title, r.address, r.category_id, r.created_at,
      not exists (
        select 1
        from public.orgao_envio_itens i
        join public.orgao_envios e on e.id = i.envio_id
        where i.report_id = r.id and e.canal_id = p_canal
      ) as nunca_enviada
    from public.reports r
    join public.orgao_canais c
      on c.id = p_canal and c.city_id = r.city_id
    join public.orgao_categorias oc
      on oc.canal_id = c.id and oc.category_id = r.category_id
    where coalesce(r.moderation_status, 'approved') = 'approved'
      and r.status in ('pending', 'in-progress')
      and coalesce(r.is_petition, false) = false
  )
  select
    cd.id,
    coalesce(nullif(btrim(cd.title), ''), 'Sem titulo'),
    coalesce(nullif(btrim(cd.address), ''), 'Endereco nao informado'),
    coalesce(cat.name, cd.category_id),
    cd.created_at,
    greatest(0, extract(day from now() - cd.created_at)::integer),
    (select count(*)::integer from public.signatures s where s.report_id = cd.id),
    cd.nunca_enviada
  from candidatas cd
  left join public.categories cat on cat.id = cd.category_id
  where p_periodo <> 'semanal' or cd.nunca_enviada
  order by cd.created_at;
$fn$;

comment on function public.relatorio_do_orgao(uuid, text) is
  'As broncas de um relatorio. Semanal: as pendentes que esta secretaria ainda nao viu. Mensal: o passivo inteiro daquelas categorias.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 6 — MONTAR E DISPARAR
-- ═══════════════════════════════════════════════════════════════════════════

-- Cria um envio por canal ativo que tenha o que reportar.
--
-- E idempotente por construcao: o `on conflict do nothing` do indice unico faz
-- a segunda chamada do mesmo periodo nao criar nada. Isso e o que permite que
-- exista um botao "gerar agora" na tela de admin sem risco de e-mail em dobro,
-- e e o que torna seguro o fallback de quando nao ha pg_cron.
create or replace function public.preparar_envios_do_orgao(
  p_periodo    text,
  p_referencia date default null
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_ref    date := coalesce(p_referencia, public.referencia_do_periodo(p_periodo));
  v_canal  record;
  v_envio  uuid;
  v_total  integer;
  v_criados integer := 0;
begin
  if p_periodo not in ('semanal', 'mensal') then
    raise exception 'periodo invalido: %', p_periodo;
  end if;
  if v_ref is null then
    raise exception 'referencia nula para o periodo %', p_periodo;
  end if;

  for v_canal in select id from public.orgao_canais where ativo loop
    select count(*) into v_total
    from public.relatorio_do_orgao(v_canal.id, p_periodo);

    -- Secretaria sem bronca nenhuma no periodo nao recebe e-mail dizendo que
    -- nao ha nada. Um relatorio vazio por semana e a forma mais rapida de o
    -- endereco inteiro virar spam.
    continue when v_total = 0;

    insert into public.orgao_envios (canal_id, periodo, referencia, total_broncas)
    values (v_canal.id, p_periodo, v_ref, v_total)
    on conflict (canal_id, periodo, referencia) do nothing
    returning id into v_envio;

    continue when v_envio is null;

    insert into public.orgao_envio_itens (envio_id, report_id, primeira_vez)
    select v_envio, rel.report_id, rel.primeira_vez
    from public.relatorio_do_orgao(v_canal.id, p_periodo) rel
    on conflict (envio_id, report_id) do nothing;

    v_criados := v_criados + 1;
  end loop;

  return v_criados;
end;
$fn$;

comment on function public.preparar_envios_do_orgao(text, date) is
  'Monta os envios do periodo, um por canal ativo com broncas. Idempotente pelo indice unico — chamar duas vezes nao duplica e-mail.';

-- Entrega os envios pendentes a Edge Function.
--
-- `net.http_post` ENFILEIRA e devolve na hora (mesma escolha da 220): a
-- transacao nao fica esperando o provedor de e-mail. O status vira
-- 'enfileirado' e quem confirma o envio de fato e a propria funcao, escrevendo
-- de volta com service role.
--
-- A janela de 30 minutos e o limite de 3 tentativas existem para o caso em que
-- a funcao morreu no meio: sem eles um envio ficaria 'enfileirado' para sempre
-- e a secretaria nunca receberia; com uma retentativa infinita, uma funcao que
-- falha DEPOIS de mandar o e-mail mandaria de novo a cada rodada.
create or replace function public.disparar_envios_do_orgao()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_url    text;
  v_secret text;
  v_envio  record;
  v_n      integer := 0;
begin
  select function_url, secret into v_url, v_secret from public.integracao_orgao where id;

  if v_url is null or btrim(v_url) = '' then
    raise notice 'integracao_orgao sem function_url; os envios ficam pendentes.';
    return 0;
  end if;

  for v_envio in
    select id from public.orgao_envios
    where (status = 'pendente')
       or (status = 'enfileirado' and tentativas < 3
           and coalesce(disparado_em, created_at) < now() - interval '30 minutes')
    order by created_at
    limit 50
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-orgao-secret', coalesce(v_secret, '')
      ),
      body    := jsonb_build_object('envio_id', v_envio.id)
    );

    update public.orgao_envios
    set status = 'enfileirado',
        disparado_em = now(),
        tentativas = tentativas + 1
    where id = v_envio.id;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

comment on function public.disparar_envios_do_orgao() is
  'Chama a Edge Function de envio para cada relatorio pendente. Retenta apos 30 min, no maximo 3 vezes.';

-- A unica das funcoes de envio que um humano chama.
--
-- POR QUE A AUTORIZACAO ESTA DENTRO DA FUNCAO
--
-- Ela e SECURITY DEFINER e vive no schema `public`, ou seja, e um endpoint do
-- PostgREST. `auth.uid() is null` significa que quem chamou foi o pg_cron ou o
-- service role — nao ha sessao. Com sessao, exige-se papel.
--
-- Nao ha dano catastrofico possivel aqui (o indice unico impede e-mail
-- duplicado, e canal inativo nao recebe nada), mas um usuario comum forcando o
-- disparo antecipado do relatorio semanal decidiria, sozinho, o que a
-- prefeitura de uma cidade recebe e quando.
create or replace function public.enviar_relatorios_do_orgao(p_periodo text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_criados integer;
begin
  if auth.uid() is not null
     and not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'somente admin pode disparar os relatorios do orgao';
  end if;

  v_criados := public.preparar_envios_do_orgao(p_periodo);
  perform public.disparar_envios_do_orgao();
  return v_criados;
end;
$fn$;

comment on function public.enviar_relatorios_do_orgao(text) is
  'Monta e dispara, na ordem. E o que o pg_cron chama — e o que o botao "gerar agora" do admin chama. Exige admin quando ha sessao.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 7 — A ENTREGA VIRA ETAPA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ESTA E A FUNCAO QUE O PEDIDO INTEIRO EXISTE PARA CHAMAR.
--
-- Chamada pelo webhook do provedor quando ele confirma `delivered`, e por mais
-- ninguem. Nao ha caminho em que o app grave 'encaminhada' porque decidiu
-- mandar um e-mail: so porque um terceiro confirmou que a mensagem chegou.
--
-- POR QUE A CONDICAO DE NAO-DUPLICAR OLHA A BRONCA INTEIRA
--
-- `not exists (etapa 'encaminhada' para esta bronca)` — nao "para esta bronca
-- neste canal". Como o indice unico garante um responsavel por categoria, os
-- dois sao a mesma coisa hoje. A diferenca aparece quando o mapeamento muda de
-- secretaria: a bronca ja encaminhada nao ganha um segundo 'encaminhada', e a
-- linha do tempo nao passa a ter dois encaminhamentos concorrentes para o mesmo
-- problema. Quem quiser registrar o reencaminhamento tem o formulario da 207.
--
-- O `observacao` DIZ ONDE CONFERIR
--
-- Sem protocolo do orgao — nao ha um ainda — mas com o que existe: qual
-- relatorio, para qual endereco, e o fato de a entrega ter sido confirmada.
-- E o mesmo criterio da 207: a etapa precisa carregar como alguem checa.
create or replace function public.registrar_entrega_do_envio(
  p_envio     uuid,
  p_ocorrido  timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_envio  record;
  v_canal  record;
  v_n      integer := 0;
begin
  select * into v_envio from public.orgao_envios where id = p_envio;
  if not found then return 0; end if;

  select * into v_canal from public.orgao_canais where id = v_envio.canal_id;
  if not found then return 0; end if;

  update public.orgao_envios
  set status = 'entregue',
      entregue_em = coalesce(entregue_em, p_ocorrido)
  where id = p_envio;

  -- Ja processado: a segunda entrega do mesmo e-mail (o provedor repete
  -- webhook) nao pode gerar uma segunda leva de etapas.
  if v_envio.status = 'entregue' then
    return 0;
  end if;

  with novas as (
    insert into public.report_official_steps (
      report_id, etapa, orgao, protocolo, observacao,
      ocorreu_em, registrado_por, registrado_por_papel
    )
    select
      i.report_id,
      'encaminhada',
      v_canal.nome,
      null,
      'Enviada no relatorio ' || v_envio.periodo || ' de '
        || to_char(v_envio.referencia, 'DD/MM/YYYY') || ' para ' || v_canal.email
        || '. A entrega na caixa do orgao foi confirmada pelo provedor de e-mail.',
      p_ocorrido,
      null,
      'sistema'
    from public.orgao_envio_itens i
    where i.envio_id = p_envio
      and not exists (
        select 1 from public.report_official_steps s
        where s.report_id = i.report_id and s.etapa = 'encaminhada'
      )
    returning report_id
  )
  update public.orgao_envio_itens i
  set virou_etapa = true
  from novas
  where i.envio_id = p_envio and i.report_id = novas.report_id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

comment on function public.registrar_entrega_do_envio(uuid, timestamptz) is
  'Entrega confirmada pelo provedor vira etapa encaminhada. Unico caminho automatico para essa etapa — envio sozinho nao basta.';

-- ── Falha derruba o canal ───────────────────────────────────────────────────
--
-- Bounce duro e reclamacao de spam nao sao contratempo: sao a informacao de que
-- continuar mandando piora tudo — a reputacao do dominio, que faz os OUTROS
-- e-mails do app pararem de chegar, e a relacao com o orgao. O canal cai e quem
-- o cadastrou e avisado, com o motivo.
--
-- Nenhuma etapa e gravada. Um relatorio devolvido nao encaminhou nada.
create or replace function public.registrar_falha_do_envio(
  p_envio    uuid,
  p_motivo   text,
  p_derruba  boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_envio record;
  v_canal record;
begin
  select * into v_envio from public.orgao_envios where id = p_envio;
  if not found then return; end if;

  update public.orgao_envios
  set status = 'falhou',
      falhou_em = now(),
      falha_motivo = left(coalesce(p_motivo, 'sem detalhe'), 500)
  where id = p_envio;

  if not p_derruba then return; end if;

  select * into v_canal from public.orgao_canais where id = v_envio.canal_id;
  if not found then return; end if;

  update public.orgao_canais
  set ativo = false,
      desativado_em = now(),
      desativado_motivo = left(coalesce(p_motivo, 'falha de entrega'), 500),
      updated_at = now()
  where id = v_canal.id;

  if v_canal.criado_por is not null then
    insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
    values (
      v_canal.criado_por,
      'status_update',
      'O canal de ' || v_canal.nome || ' foi desligado',
      'O e-mail ' || v_canal.email || ' devolveu a mensagem: '
        || left(coalesce(p_motivo, 'sem detalhe'), 200)
        || ' Confira o endereco e peca a reativacao.',
      '/admin/canais-do-orgao',
      false,
      now()
    );
  end if;
end;
$fn$;

comment on function public.registrar_falha_do_envio(uuid, text, boolean) is
  'Bounce duro ou reclamacao: o canal cai, quem cadastrou e avisado, e NENHUMA etapa e gravada. Relatorio devolvido nao encaminhou nada.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 8 — A PAGINA PUBLICA DO ORGAO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sem login: quem tem o token e quem recebeu o e-mail. A superficie e
-- deliberadamente minima — ler o relatorio e confirmar o recebimento do lote.
-- Nao ha como declarar execucao por aqui, porque quem repassar o link nao pode
-- afirmar obra feita numa tabela que nao tem delete.

create or replace function public.relatorio_publico_do_orgao(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare
  v_envio  record;
  v_canal  record;
  v_cidade text;
  v_itens  jsonb;
begin
  select * into v_envio from public.orgao_envios where token = p_token;
  if not found then
    return jsonb_build_object('encontrado', false);
  end if;

  select * into v_canal from public.orgao_canais where id = v_envio.canal_id;
  select ci.name into v_cidade from public.cities ci where ci.id = v_canal.city_id;

  select coalesce(jsonb_agg(x order by x->>'criada_em'), '[]'::jsonb) into v_itens
  from (
    select jsonb_build_object(
      'report_id',   r.id,
      'titulo',      coalesce(nullif(btrim(r.title), ''), 'Sem titulo'),
      'endereco',    coalesce(nullif(btrim(r.address), ''), 'Endereco nao informado'),
      'categoria',   coalesce(cat.name, r.category_id),
      'criada_em',   r.created_at,
      'dias_aberta', greatest(0, extract(day from now() - r.created_at)::integer),
      'resolvida',   r.status = 'resolved',
      'primeira_vez', i.primeira_vez
    ) as x
    from public.orgao_envio_itens i
    join public.reports r on r.id = i.report_id
    left join public.categories cat on cat.id = r.category_id
    where i.envio_id = v_envio.id
  ) s;

  return jsonb_build_object(
    'encontrado',   true,
    'orgao',        v_canal.nome,
    'cidade',       v_cidade,
    'periodo',      v_envio.periodo,
    'referencia',   v_envio.referencia,
    'enviado_em',   v_envio.enviado_em,
    'confirmado_em', v_envio.confirmado_em,
    'protocolo',    v_envio.protocolo_informado,
    'total',        v_envio.total_broncas,
    'broncas',      v_itens
  );
end;
$fn$;

comment on function public.relatorio_publico_do_orgao(uuid) is
  'O relatorio como a secretaria o le, sem login. Nao devolve o token nem nada sobre quem registrou as broncas.';

-- O clique que vira 'recebida'.
--
-- POR QUE O CLIQUE E NAO A ABERTURA
--
-- Cliente de e-mail corporativo pre-carrega imagem e as vezes segue link para
-- varredura de seguranca. Gravar 'recebida' na abertura significaria afirmar
-- que um servidor antivirus tratou a demanda. O botao exige uma acao
-- deliberada, e e a diferenca entre "chegou" e "alguem viu".
--
-- IDEMPOTENTE
--
-- Confirmar duas vezes nao gera duas levas de etapa nem sobrescreve a data da
-- primeira. A segunda chamada devolve o mesmo resultado da primeira.
create or replace function public.confirmar_recebimento_do_orgao(
  p_token      uuid,
  p_protocolo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_envio record;
  v_canal record;
  v_n     integer := 0;
begin
  select * into v_envio from public.orgao_envios where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;

  if v_envio.confirmado_em is not null then
    return jsonb_build_object('ok', true, 'ja_confirmado', true,
                              'confirmado_em', v_envio.confirmado_em);
  end if;

  select * into v_canal from public.orgao_canais where id = v_envio.canal_id;

  update public.orgao_envios
  set confirmado_em = now(),
      protocolo_informado = nullif(btrim(p_protocolo), '')
  where id = v_envio.id;

  insert into public.report_official_steps (
    report_id, etapa, orgao, protocolo, observacao,
    ocorreu_em, registrado_por, registrado_por_papel
  )
  select
    i.report_id,
    'recebida',
    v_canal.nome,
    nullif(btrim(p_protocolo), ''),
    'O orgao confirmou o recebimento do relatorio '
      || v_envio.periodo || ' de ' || to_char(v_envio.referencia, 'DD/MM/YYYY') || '.',
    now(),
    null,
    'sistema'
  from public.orgao_envio_itens i
  where i.envio_id = v_envio.id
    and not exists (
      select 1 from public.report_official_steps s
      where s.report_id = i.report_id and s.etapa = 'recebida'
    );

  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'ja_confirmado', false, 'etapas', v_n);
end;
$fn$;

comment on function public.confirmar_recebimento_do_orgao(uuid, text) is
  'Clique humano no link do e-mail vira etapa recebida. Idempotente: confirmar duas vezes nao duplica etapa.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 9 — O QUE A BRONCA MOSTRA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Cobrada 4x desde 03/09". Leitura publica: e a mesma informacao que a etapa
-- oficial ja e, so que sem gerar notificacao a cada repeticao.
create or replace function public.cobrancas_da_bronca(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select coalesce(
    (
      select jsonb_build_object(
        'orgao',      max(c.nome),
        'total',      count(*)::integer,
        'primeira',   min(coalesce(e.enviado_em, e.created_at)),
        'ultima',     max(coalesce(e.enviado_em, e.created_at)),
        'entregues',  count(*) filter (where e.status in ('entregue'))::integer,
        'confirmadas', count(*) filter (where e.confirmado_em is not null)::integer
      )
      from public.orgao_envio_itens i
      join public.orgao_envios e on e.id = i.envio_id
      join public.orgao_canais c on c.id = e.canal_id
      where i.report_id = p_report_id
        and e.status in ('enviado', 'entregue')
    ),
    jsonb_build_object('total', 0)
  );
$fn$;

comment on function public.cobrancas_da_bronca(uuid) is
  'Quantas vezes esta bronca foi para a secretaria e quando. Informacao sem notificacao — a repeticao nao vira etapa.';

-- ── Os envios de um canal, para a tela de admin ─────────────────────────────
--
-- E RPC e nao SELECT direto por um motivo: `orgao_envios.token` autoriza
-- confirmar recebimento sem login. Se a tela de admin lesse a tabela, o
-- embaixador poderia abrir o link e confirmar no lugar da prefeitura — e a
-- etapa 'recebida' deixaria de significar o que diz significar.
create or replace function public.envios_do_canal(p_canal uuid, p_limite integer default 20)
returns table (
  id            uuid,
  periodo       text,
  referencia    date,
  total_broncas integer,
  status        text,
  enviado_em    timestamptz,
  entregue_em   timestamptz,
  confirmado_em timestamptz,
  protocolo_informado text,
  falha_motivo  text,
  etapas_geradas integer
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select
    e.id, e.periodo, e.referencia, e.total_broncas, e.status,
    e.enviado_em, e.entregue_em, e.confirmado_em, e.protocolo_informado,
    e.falha_motivo,
    (select count(*)::integer from public.orgao_envio_itens i
     where i.envio_id = e.id and i.virou_etapa)
  from public.orgao_envios e
  join public.orgao_canais c on c.id = e.canal_id
  where e.canal_id = p_canal
    and public.pode_gerir_canal_do_orgao(auth.uid(), c.city_id)
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limite, 20), 100));
$fn$;

comment on function public.envios_do_canal(uuid, integer) is
  'Historico de envios de um canal, sem o token. E RPC justamente para nao distribuir a autorizacao de confirmar recebimento.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 10 — RLS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orgao_canais         enable row level security;
alter table public.orgao_categorias     enable row level security;
alter table public.orgao_envios         enable row level security;
alter table public.orgao_envio_itens    enable row level security;
alter table public.orgao_envio_eventos  enable row level security;

-- Canal: quem responde pela cidade ve e cadastra. `ativo` e a excecao — quem
-- cadastra nao ativa, e e disso que depende o gate inteiro.
drop policy if exists orgao_canais_gestor_select on public.orgao_canais;
create policy orgao_canais_gestor_select on public.orgao_canais
  for select to authenticated
  using (public.pode_gerir_canal_do_orgao(auth.uid(), city_id));

drop policy if exists orgao_canais_gestor_insert on public.orgao_canais;
create policy orgao_canais_gestor_insert on public.orgao_canais
  for insert to authenticated
  with check (
    public.pode_gerir_canal_do_orgao(auth.uid(), city_id)
    and criado_por = auth.uid()
    -- Cadastro nasce inativo, sempre. Nao ha caminho de insert que ja entregue
    -- um canal ligado — nem para admin, que ativa num segundo passo explicito.
    and ativo is false
  );

-- Update em duas policies, de proposito: o gestor edita o conteudo, e a
-- checagem de `ativo` mora numa policy separada onde da para ler a regra sem
-- desembaraçar um OR de quatro termos.
drop policy if exists orgao_canais_gestor_update on public.orgao_canais;
create policy orgao_canais_gestor_update on public.orgao_canais
  for update to authenticated
  using (public.pode_gerir_canal_do_orgao(auth.uid(), city_id))
  with check (public.pode_gerir_canal_do_orgao(auth.uid(), city_id));

-- Quem nao e admin nao consegue LIGAR um canal. O gatilho e o lugar certo para
-- isto e nao a policy: policy nao enxerga o valor antigo da linha, entao "so
-- admin pode mudar de false para true" nao e expressavel nela.
create or replace function public.orgao_canal_so_admin_ativa()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  new.updated_at := now();

  if new.ativo is distinct from old.ativo then
    -- auth.uid() nulo = service role (webhook derrubando canal por bounce).
    if auth.uid() is not null
       and not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
      raise exception 'somente admin pode ativar ou desativar um canal do orgao';
    end if;

    if new.ativo then
      new.ativado_por := coalesce(auth.uid(), new.ativado_por);
      new.ativado_em  := now();
      new.desativado_em := null;
      new.desativado_motivo := null;
    else
      new.desativado_em := coalesce(new.desativado_em, now());
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists a_orgao_canal_so_admin_ativa on public.orgao_canais;
create trigger a_orgao_canal_so_admin_ativa
before update on public.orgao_canais
for each row execute function public.orgao_canal_so_admin_ativa();

drop policy if exists orgao_canais_admin_delete on public.orgao_canais;
create policy orgao_canais_admin_delete on public.orgao_canais
  for delete to authenticated
  using (public.is_admin(auth.uid()) or public.is_master(auth.uid()));

-- Mapeamento: mesma autoridade do canal.
drop policy if exists orgao_categorias_gestor on public.orgao_categorias;
create policy orgao_categorias_gestor on public.orgao_categorias
  for all to authenticated
  using (
    exists (select 1 from public.orgao_canais c
            where c.id = canal_id
              and public.pode_gerir_canal_do_orgao(auth.uid(), c.city_id))
  )
  with check (
    exists (select 1 from public.orgao_canais c
            where c.id = canal_id
              and public.pode_gerir_canal_do_orgao(auth.uid(), c.city_id))
  );

-- Envios, itens e eventos: NENHUMA policy, de proposito.
--
-- Quem escreve e a Edge Function com service role; quem le e `envios_do_canal`
-- e `cobrancas_da_bronca`, que sao SECURITY DEFINER e escolhem o que devolver.
-- O token nunca atravessa. RLS ligada sem policy = ninguem passa.
revoke all on public.orgao_envios        from anon, authenticated;
revoke all on public.orgao_envio_itens   from anon, authenticated;
revoke all on public.orgao_envio_eventos from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 11 — GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

grant select, insert, update, delete on public.orgao_canais     to authenticated;
grant select, insert, update, delete on public.orgao_categorias to authenticated;

grant execute on function public.pode_gerir_canal_do_orgao(uuid, bigint) to authenticated;
grant execute on function public.envios_do_canal(uuid, integer)          to authenticated;
grant execute on function public.enviar_relatorios_do_orgao(text)        to authenticated;
grant execute on function public.cobrancas_da_bronca(uuid)               to anon, authenticated;

-- As duas do orgao, sem login. E o unico ponto de entrada anonimo criado aqui,
-- e as duas exigem o token — que so existe dentro do e-mail.
grant execute on function public.relatorio_publico_do_orgao(uuid)          to anon, authenticated;
grant execute on function public.confirmar_recebimento_do_orgao(uuid, text) to anon, authenticated;

-- ── O REVOKE E OBRIGATORIO, NAO COSMETICO ──────────────────────────────────
--
-- No Postgres, funcao nova nasce com EXECUTE concedido a PUBLIC. Como estas
-- funcoes sao SECURITY DEFINER e moram no schema `public`, o PostgREST as
-- expoe: sem os revokes abaixo, qualquer usuario logado poderia chamar
-- `registrar_entrega_do_envio` e fabricar a etapa "encaminhada" de um lote
-- inteiro de broncas — a exata afirmacao que este arquivo inteiro existe para
-- so permitir com prova de terceiro.
--
-- Quem chama estas quatro e o pg_cron (dono do banco) e a Edge Function com
-- service role, e nenhum dos dois passa por estes grants.

revoke all on function public.preparar_envios_do_orgao(text, date)          from public, anon, authenticated;
revoke all on function public.disparar_envios_do_orgao()                    from public, anon, authenticated;
revoke all on function public.registrar_entrega_do_envio(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.registrar_falha_do_envio(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.relatorio_do_orgao(uuid, text)                from public, anon, authenticated;

-- Os gatilhos rodam como dono; ninguem precisa poder chama-los direto.
revoke all on function public.orgao_categoria_herda_cidade()  from public, anon, authenticated;
revoke all on function public.orgao_canal_so_admin_ativa()    from public, anon, authenticated;

-- As duas que o webhook chama, nominalmente. As default privileges do Supabase
-- ja concedem a `service_role`, mas depender de configuracao de ambiente para o
-- caminho que grava a etapa oficial seria descobrir o problema em producao.
grant execute on function public.registrar_entrega_do_envio(uuid, timestamptz) to service_role;
grant execute on function public.registrar_falha_do_envio(uuid, text, boolean) to service_role;

-- E as concedidas acima, agora explicitas — depois de um `revoke ... from
-- public`, o grant nominal e o que resta valendo.
grant execute on function public.pode_gerir_canal_do_orgao(uuid, bigint) to authenticated;
grant execute on function public.envios_do_canal(uuid, integer)          to authenticated;
grant execute on function public.enviar_relatorios_do_orgao(text)        to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 12 — AGENDAMENTO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- pg_cron roda em UTC. 11:00 UTC = 08:00 no horario de Brasilia, que e quando
-- uma secretaria abre. Semanal na segunda; mensal no dia 1.
--
-- Sem pg_cron o app nao fica sem saida: `enviar_relatorios_do_orgao` e
-- idempotente e esta concedida a authenticated, entao o botao "gerar agora" da
-- tela de admin cobre o caso. Mesma escolha da 206.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('relatorio_orgao_semanal');
    exception when others then null;
    end;
    begin
      perform cron.unschedule('relatorio_orgao_mensal');
    exception when others then null;
    end;
    begin
      perform cron.unschedule('relatorio_orgao_retentativa');
    exception when others then null;
    end;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('relatorio_orgao_semanal', '0 11 * * 1',
      $cron$select public.enviar_relatorios_do_orgao('semanal');$cron$);
    perform cron.schedule('relatorio_orgao_mensal', '0 11 1 * *',
      $cron$select public.enviar_relatorios_do_orgao('mensal');$cron$);
    -- Reaproveita a janela de 30 min de `disparar_envios_do_orgao`: o que a
    -- funcao de envio nao conseguiu concluir volta para a fila sozinho.
    perform cron.schedule('relatorio_orgao_retentativa', '*/15 * * * *',
      $cron$select public.disparar_envios_do_orgao();$cron$);
    return;
  end if;
  raise notice 'pg_cron indisponivel; o disparo fica por conta do botao do admin.';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DEPOIS DE APLICAR, EM CADA AMBIENTE
-- ═══════════════════════════════════════════════════════════════════════════
--
--   insert into public.integracao_orgao (id, function_url, secret)
--   values (true, 'https://<ref>.supabase.co/functions/v1/send-agency-report', '<segredo>')
--   on conflict (id) do update
--     set function_url = excluded.function_url,
--         secret = excluded.secret,
--         updated_at = now();
--
-- E nos segredos das Edge Functions:
--   ORGAO_FUNCTION_SECRET = o mesmo <segredo> acima
--   RESEND_API_KEY        = ja existe (send-report-status-email usa)
--   RESEND_WEBHOOK_SECRET = o `whsec_...` do webhook criado no painel do Resend,
--                           apontando para .../functions/v1/orgao-email-webhook
--                           com os eventos email.sent, email.delivered,
--                           email.bounced, email.complained, email.opened,
--                           email.clicked.

notify pgrst, 'reload schema';
