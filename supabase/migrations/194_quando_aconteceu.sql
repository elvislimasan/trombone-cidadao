-- 193_quando_aconteceu.sql
--
-- As acoes passam a poder dizer QUANDO aconteceram.
--
-- O QUE A FILA OFFLINE QUEBROU
--
-- Ate agora `now()` era a verdade: a acao chegava no instante em que era feita,
-- entao a hora do servidor e a hora do fato eram a mesma coisa.
--
-- Com a fila (src/lib/offlineQueue.js) elas se separam. Uma patrulha de sabado
-- de manha, numa area sem cobertura, sobe domingo a noite quando o telefone
-- reencontra o wi-fi. Sem esta migracao:
--
--   * a bronca aparece no feed com data de domingo, e quem le acha que o buraco
--     surgiu ontem;
--   * a sequencia de dias seguidos conta domingo em vez de sabado — a pessoa
--     perde a corrente por ter patrulhado num lugar sem sinal;
--   * o placar do bairro joga a acao na janela de 90 dias errada.
--
-- ⚠️ POR QUE O PARAMETRO NAO CONFIA NO CLIENTE
--
-- A hora vem do relogio do aparelho, que a pessoa controla. Sem limite, daria
-- para carimbar uma bronca com data de 2019 e aparecer no topo de qualquer
-- listagem por antiguidade — ou com data futura e ficar em primeiro para sempre.
--
-- Por isso `hora_confiavel` prende o valor entre "sete dias atras" e "agora":
--
--   * sete dias cobre com folga qualquer fila real (o app tenta a cada 60 s, e
--     bastam segundos de rede para esvaziar);
--   * futuro nunca passa — relogio adiantado vira `now()`, o que e o pior caso
--     aceitavel: a acao conta como se tivesse acabado de acontecer.
--
-- Nulo continua valendo `now()`, entao versoes antigas do app seguem
-- funcionando sem mudanca nenhuma.

create or replace function public.hora_confiavel(p_quando timestamptz)
returns timestamptz
language sql
immutable
as $fn$
  select case
    when p_quando is null then now()
    when p_quando > now() then now()
    when p_quando < now() - interval '7 days' then now() - interval '7 days'
    else p_quando
  end;
$fn$;

comment on function public.hora_confiavel(timestamptz) is
  'Prende uma data vinda do cliente entre 7 dias atras e agora. Usada pelas acoes que podem subir com atraso pela fila offline.';

grant execute on function public.hora_confiavel(timestamptz) to authenticated;

-- ── Sinalizacao ─────────────────────────────────────────────────────────────
--
-- `create_patrol_signal` ganha `p_quando`. Assinatura nova = a antiga precisa
-- sair, senao ficam as duas e o PostgREST escolhe pelo corpo do JSON — a
-- ambiguidade que ja custou uma migracao inteira (ver o cabecalho da 191).
drop function if exists public.create_patrol_signal(
  double precision, double precision, text, bigint, text, text
);

create or replace function public.create_patrol_signal(
  p_lat double precision,
  p_lng double precision,
  p_category_id text,
  p_city_id bigint default null,
  p_neighborhood text default null,
  p_address text default null,
  p_quando timestamptz default null
)
returns table (id uuid, duplicado boolean, existente_id uuid)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  v_ponto extensions.geometry;
  v_existente uuid;
  v_nome_categoria text;
  v_id uuid;
  v_quando timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'sem coordenada' using errcode = '22023';
  end if;

  v_quando := public.hora_confiavel(p_quando);
  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  -- Mesmo buraco, quinze sinais: sem este freio, o primeiro quarteirao ruim
  -- vira uma fila de missoes identicas e o mapa fica ilegivel. 30 m e a ordem
  -- de grandeza de um poste ao outro.
  select r.id into v_existente
  from public.reports r
  where r.origin = 'signal'
    and r.signal_status = 'open'
    and r.category_id is not distinct from p_category_id
    and r.location is not null
    and extensions.st_dwithin(
          r.location::extensions.geography,
          v_ponto::extensions.geography,
          30
        )
  limit 1;

  if v_existente is not null then
    return query select null::uuid, true, v_existente;
    return;
  end if;

  select c.name into v_nome_categoria
  from public.categories c where c.id = p_category_id;

  insert into public.reports (
    title, description, address, category_id, location, author_id, protocol,
    status, moderation_status, city_id, is_anonymous,
    origin, signal_status, neighborhood, created_at
  ) values (
    coalesce(v_nome_categoria, 'Problema') || ' sinalizado',
    'Sinalizado em campo. Aguarda registro completo com foto.',
    coalesce(
      nullif(btrim(p_address), ''),
      nullif(btrim(p_neighborhood), ''),
      'Local sinalizado em patrulha'
    ),
    p_category_id,
    v_ponto,
    auth.uid(),
    'TROMB-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
    'pending',
    -- Fora de tudo que filtra por 'approved', que e o feed inteiro.
    'pending_approval',
    p_city_id,
    false,
    'signal',
    'open',
    nullif(btrim(p_neighborhood), ''),
    v_quando
  )
  returning reports.id into v_id;

  return query select v_id, false, null::uuid;
end $fn$;

comment on function public.create_patrol_signal(double precision, double precision, text, bigint, text, text, timestamptz) is
  'Cria um sinal aberto. `p_quando` permite que a fila offline preserve a hora do fato — presa entre 7 dias atras e agora (hora_confiavel).';

grant execute on function public.create_patrol_signal(
  double precision, double precision, text, bigint, text, text, timestamptz
) to authenticated;

-- ── Vistoria vazia ──────────────────────────────────────────────────────────
drop function if exists public.mark_patrol_signal_empty(uuid, double precision, double precision);

create or replace function public.mark_patrol_signal_empty(
  p_signal_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_quando timestamptz default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  v_distancia double precision;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  select extensions.st_distance(
           r.location::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
         )
    into v_distancia
  from public.reports r
  where r.id = p_signal_id
    and r.origin = 'signal'
    and r.signal_status = 'open';

  if not found then
    raise exception 'missao indisponivel' using errcode = 'P0002';
  end if;

  if v_distancia is null or v_distancia > public.patrol_signal_presence_m() then
    raise exception 'fora do local' using errcode = 'P0001';
  end if;

  update public.reports
  set signal_status = 'empty',
      emptied_by = auth.uid(),
      emptied_at = public.hora_confiavel(p_quando),
      -- Some da fila de moderacao: nao ha o que aprovar num sinal que nao
      -- virou bronca.
      moderation_status = 'rejected'
  where id = p_signal_id;
end $fn$;

comment on function public.mark_patrol_signal_empty(uuid, double precision, double precision, timestamptz) is
  'Encerra um sinal aberto como "nao ha nada aqui". `p_quando` preserva a hora do fato para envios atrasados pela fila offline.';

grant execute on function public.mark_patrol_signal_empty(
  uuid, double precision, double precision, timestamptz
) to authenticated;

-- ── Registro completo em cima de um sinal ───────────────────────────────────
--
-- Aqui NAO ha drop nem parametro novo, e e de proposito.
--
-- A funcao ja tem doze argumentos (ver 191) e um decimo terceiro so para a data
-- pagaria caro: outra rodada de drop/create com risco de sobrecarga orfa, num
-- caminho que ja quebrou uma vez por exatamente isso.
--
-- E `completed_at` importa menos que os outros: ele nao alimenta a sequencia de
-- dias nem aparece no feed. O que aparece e o `created_at` do sinal — que ja foi
-- gravado com a hora certa la em cima, quando o ponto foi marcado.

-- ── Confirmacoes e broncas criadas do zero ──────────────────────────────────
--
-- Essas duas sao INSERT direto na tabela, sem RPC no meio: o cliente ja manda o
-- `created_at` que quiser. O que faltava era o banco nao aceitar qualquer data.
--
-- Um gatilho BEFORE INSERT resolve para as duas de uma vez — e para qualquer
-- caminho futuro que grave nessas tabelas.
create or replace function public.prender_created_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  new.created_at := public.hora_confiavel(new.created_at);
  return new;
end $fn$;

comment on function public.prender_created_at() is
  'Impede data inventada em insert vindo do cliente. Ver hora_confiavel e o cabecalho da 193.';

-- ⚠️ O NOME COMECA COM `a_` DE PROPOSITO.
--
-- Gatilhos BEFORE disparam em ordem alfabetica, e este precisa correr ANTES do
-- `set_report_moderation_status` (ver a 187) e de qualquer outro que leia a
-- data. Um `zzz_` aqui prenderia a data depois de alguem ja ter usado a
-- inventada.
drop trigger if exists a_reports_created_at on public.reports;
create trigger a_reports_created_at
  before insert on public.reports
  for each row
  execute function public.prender_created_at();

drop trigger if exists a_report_updates_created_at on public.report_updates;
create trigger a_report_updates_created_at
  before insert on public.report_updates
  for each row
  execute function public.prender_created_at();

-- ── Patrulhas ───────────────────────────────────────────────────────────────
--
-- `patrols` ja recebia `started_at` e `ended_at` explicitos do cliente desde a
-- 172 — a fila offline nao mudou nada ali. Mas eles nunca foram validados, e
-- agora que podem chegar com dias de atraso vale prender os dois.
create or replace function public.prender_periodo_patrulha()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  new.ended_at := public.hora_confiavel(new.ended_at);
  -- O inicio pode ser anterior a janela dos 7 dias sem ser mentira: uma
  -- patrulha longa comecou antes de terminar. So o teto importa.
  if new.started_at > new.ended_at then
    new.started_at := new.ended_at;
  end if;
  return new;
end $fn$;

drop trigger if exists a_patrols_periodo on public.patrols;
create trigger a_patrols_periodo
  before insert on public.patrols
  for each row
  execute function public.prender_periodo_patrulha();
