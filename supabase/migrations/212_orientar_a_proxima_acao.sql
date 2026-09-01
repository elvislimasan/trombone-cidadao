-- 212_orientar_a_proxima_acao.sql
--
-- Fase 2 do roadmap revisado (secao 36.14): reduzir a decisao de "o que eu faco
-- agora?".
--
-- O QUE O BANCO PRECISA FORNECER, E O QUE ELE NAO DEVE DECIDIR
--
-- A regra de recencia e confianca mora em `src/lib/recencia.js` — cinco estados
-- (sem dado, vencido, uma observacao, duas ou mais, conflito) com os mesmos
-- criterios de independencia da 199. Reimplementa-la em SQL criaria duas
-- verdades sobre a mesma rua, e a primeira vez que divergissem ninguem saberia
-- qual olhar.
--
-- Entao a RPC daqui NAO devolve o estado. Devolve os pontos ao alcance e, com
-- cada um, as observacoes que o app precisa para calcular o estado — autor,
-- tipo e data, nada mais. Uma consulta, uma regra, um lugar.
--
-- POR QUE UMA RPC NOVA, E NAO `reports_map_clusters`
--
-- Aquela funcao responde "o que desenhar neste retangulo do mapa", agrupa por
-- zoom e devolve cluster. A rota pergunta outra coisa: "o que vale a pena
-- visitar a pe a partir daqui". Retangulo nao e raio, cluster nao e parada, e
-- forcar uma na outra faria a rota herdar o agrupamento por zoom — que junta
-- cinco broncas num pino so e some com quatro paradas.
--
-- AS TRES TABELAS QUE FALTAVAM
--
--   * `report_audit_requests` — "algo esta errado aqui". Nasce de tres lugares
--     (pular por ponto errado, colaborar pedindo auditoria, e o conflito de
--     recencia) e todos precisavam do mesmo destino: alguem olhar.
--   * `route_skips` — por que as rotas nao fecham. Sem isso o produto so sabe
--     que a pessoa parou, nunca por que.
--
-- AS POLICIES ESTAO AQUI, DE PROPOSITO — mesma razao da 206 e da 207.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 — OS ALVOS DA ROTA
-- ═══════════════════════════════════════════════════════════════════════════

-- Broncas abertas e sinais pendentes ao alcance de uma caminhada.
--
-- `security definer` pelo mesmo motivo de `patrol_missions_nearby` (173): traz
-- o nome de quem registrou sem depender de a policy de `profiles` liberar
-- leitura de terceiros. Devolve so nome.
--
-- O LIMITE DE RAIO E ESTREITO DE PROPOSITO
--
-- Teto de 2 km. A Rota do Dia e um piloto A PE (secao 36.6, Aposta 3), e um
-- raio maior serviria so para o modo carro herdar por acidente uma mecanica
-- desenhada para pedestres — que e exatamente o que o plano proibe.
create or replace function public.rota_do_dia_alvos(
  p_lat        double precision,
  p_lng        double precision,
  p_raio_m     double precision default 800,
  p_limite     integer default 40
)
returns table (
  id                uuid,
  tipo              text,
  lat               double precision,
  lng               double precision,
  category_id       text,
  category_name     text,
  title             text,
  address           text,
  status            text,
  author_id         uuid,
  completed_by      uuid,
  created_at        timestamptz,
  distance_meters   double precision,
  observacoes       jsonb
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with origem as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as pt
  ),
  perto as (
    select r.*
    from public.reports r
    cross join origem o
    where r.location is not null
      and coalesce(r.moderation_status, 'approved') = 'approved'
      and (
        -- Bronca aberta: e o que a rota vai pedir para conferir.
        (coalesce(r.origin, 'full') = 'full' and r.status in ('pending', 'in-progress'))
        -- Sinal pendente: alguem apontou e ninguem foi ate la completar.
        or (r.origin = 'signal' and r.signal_status = 'open')
      )
      and extensions.st_dwithin(
            r.location::extensions.geography,
            o.pt::extensions.geography,
            greatest(100, least(coalesce(p_raio_m, 800), 2000))
          )
  )
  select
    p.id,
    case when p.origin = 'signal' then 'sinal' else 'bronca' end,
    extensions.st_y(p.location::extensions.geometry),
    extensions.st_x(p.location::extensions.geometry),
    p.category_id,
    c.name,
    p.title,
    p.address,
    p.status,
    p.author_id,
    p.completed_by,
    p.created_at,
    extensions.st_distance(p.location::extensions.geography, o.pt::extensions.geography),
    -- So o necessario para `estadoDeRecencia` decidir. Mensagem e foto ficam de
    -- fora: a rota nao mostra o que a observacao anterior disse antes de a
    -- pessoa responder (a pergunta cega da secao 36.5), entao mandar o texto
    -- seria mandar exatamente o que nao pode ser exibido.
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
                 'author_id',   u.author_id,
                 'update_type', u.update_type,
                 'status',      u.status,
                 'created_at',  u.created_at
               ))
        from public.report_updates u
        where u.report_id = p.id
          and coalesce(u.status, '') <> 'rejected'
          -- Janela de 90 dias: `estadoDeRecencia` so distingue "recente" de
          -- "vencido", e uma linha de 2024 nao muda nenhuma das duas respostas.
          and u.created_at >= now() - interval '90 days'
      ),
      '[]'::jsonb
    )
  from perto p
  cross join origem o
  left join public.categories c on c.id = p.category_id
  order by p.location operator(extensions.<->) o.pt
  limit greatest(1, least(coalesce(p_limite, 40), 100));
$fn$;

comment on function public.rota_do_dia_alvos(double precision, double precision, double precision, integer) is
  'Broncas abertas e sinais pendentes ao alcance de uma caminhada, com as observacoes que src/lib/recencia.js usa para decidir recencia e confianca. Nao devolve o estado: a regra mora no cliente, num lugar so.';

grant execute on function public.rota_do_dia_alvos(
  double precision, double precision, double precision, integer
) to authenticated;

-- ── Disponibilidade real, para a diaria ─────────────────────────────────────
--
-- A guarda de `sortearDiarias` existe desde a 200, mas ninguem nunca lhe passou
-- um valor: `temAlvos` tinha default `true` e nenhum chamador o informava. Ou
-- seja, a protecao contra "diaria impossivel" estava escrita e desligada — e a
-- pessoa numa cidade sem sinal pendente recebia "confira 2 pontos marcados" e
-- passava o dia procurando o que nao existe.
--
-- Duas contagens em vez de um booleano porque as diarias perguntam coisas
-- diferentes: "confirmar broncas na rua" precisa de bronca, "conferir pontos
-- marcados" precisa de sinal. Um `true` unico faria a segunda ser sorteada por
-- causa da primeira.
create or replace function public.alvos_por_perto(
  p_lat    double precision,
  p_lng    double precision,
  p_raio_m double precision default 2000
)
returns table (broncas integer, sinais integer)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with origem as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as pt
  )
  select
    count(*) filter (
      where coalesce(r.origin, 'full') = 'full' and r.status in ('pending', 'in-progress')
    )::integer,
    count(*) filter (
      where r.origin = 'signal' and r.signal_status = 'open'
    )::integer
  from public.reports r
  cross join origem o
  where r.location is not null
    and coalesce(r.moderation_status, 'approved') = 'approved'
    and extensions.st_dwithin(
          r.location::extensions.geography,
          o.pt::extensions.geography,
          greatest(500, least(coalesce(p_raio_m, 2000), 20000))
        );
$fn$;

comment on function public.alvos_por_perto(double precision, double precision, double precision) is
  'Quantas broncas abertas e sinais pendentes ha ao redor. Alimenta a guarda contra diaria impossivel em src/lib/dailies.js, que existia desligada desde a 200.';

grant execute on function public.alvos_por_perto(
  double precision, double precision, double precision
) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 — "ALGO ESTA ERRADO AQUI"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tres caminhos chegam aqui, e ate agora nenhum tinha destino:
--
--   * pular uma parada com motivo "o ponto esta no lugar errado";
--   * colaborar numa bronca existente escolhendo "algo esta errado aqui";
--   * conflito de recencia — duas observacoes recentes se contradizendo.
--
-- POR QUE NAO E UMA ATUALIZACAO DE BRONCA
--
-- Porque nao afirma nada sobre o problema. "A coordenada esta errada" e
-- "continua o buraco" sao frases sobre coisas diferentes, e guardar a primeira
-- como `report_updates` faria a contagem de confirmacoes da 199 subir por causa
-- de uma reclamacao sobre o cadastro. O quorum passaria a somar gente que nem
-- olhou para o problema.
--
-- MAIS UMA OBSERVACAO NAO RESOLVE CONTRADICAO
--
-- E a razao de o conflito vir para ca em vez de virar prioridade na rota. Duas
-- pessoas discordando no mesmo mes costuma significar que a pergunta esta
-- errada, que o ponto esta no lugar errado, ou que alguem consertou entre as
-- duas visitas — e nenhuma dessas se resolve por maioria.

create table if not exists public.report_audit_requests (
  id           bigint generated by default as identity primary key,
  report_id    uuid not null references public.reports(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,

  motivo       text not null,
  observacao   text,

  status       text not null default 'aberta',
  resolvido_por uuid references public.profiles(id) on delete set null,
  resolvido_em  timestamptz,
  desfecho      text,

  created_at   timestamptz not null default now(),

  constraint report_audit_requests_motivo_valido check (motivo in (
    'ponto_errado', 'risco_no_local', 'colaboracao', 'conflito', 'outro'
  )),
  constraint report_audit_requests_status_valido check (status in (
    'aberta', 'resolvida', 'descartada'
  )),
  constraint report_audit_requests_fechada_tem_desfecho check (
    status = 'aberta' or (resolvido_em is not null and resolvido_por is not null)
  )
);

comment on table public.report_audit_requests is
  'Pedidos de auditoria sobre o CADASTRO da bronca (ponto, categoria, descricao) ou sobre risco no local. Nunca afirma nada sobre o estado do problema — para isso existe report_updates.';
comment on column public.report_audit_requests.motivo is
  'risco_no_local nunca vai para tela publica: publicar onde alguem se sentiu inseguro e anunciar qual rua esta sem gente olhando (secao 36.6).';

-- Uma pessoa nao abre dez pedidos sobre a mesma bronca pelo mesmo motivo.
create unique index if not exists report_audit_requests_sem_repeticao
  on public.report_audit_requests (report_id, user_id, motivo)
  where status = 'aberta';

create index if not exists report_audit_requests_fila_idx
  on public.report_audit_requests (status, created_at)
  where status = 'aberta';

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3 — POR QUE AS ROTAS NAO FECHAM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O pulo com motivo estruturado e uma das entregas da fase 2, e o motivo so
-- vale se alguem puder conta-lo. Sem esta tabela, o produto sabe que a rota
-- parou e nunca sabe se foi portao fechado, ponto errado ou medo — e as tres
-- pedem correcoes completamente diferentes.
--
-- `dia` em vez de um id de rota porque a rota NAO e uma linha em lugar nenhum:
-- ela e montada ao abrir, a partir do estado do mundo naquele instante
-- (`montarRota` em src/lib/rotaDoDia.js). Guardar a rota inteira criaria uma
-- entidade que so existe para dar chave estrangeira a esta tabela.

create table if not exists public.route_skips (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  report_id   uuid not null references public.reports(id) on delete cascade,
  dia         date not null default (now() at time zone 'America/Sao_Paulo')::date,

  motivo      text not null,
  observacao  text,

  created_at  timestamptz not null default now(),

  constraint route_skips_motivo_valido check (motivo in (
    'nao_existe_mais', 'nao_consegui_chegar', 'ponto_errado', 'risco_no_local', 'sem_tempo'
  ))
);

comment on table public.route_skips is
  'Por que uma parada da Rota do Dia foi pulada. Espelha MOTIVOS_DE_PULO em src/lib/pularAlvo.js. Sem isto o produto so sabe que a pessoa parou, nunca por que.';

-- Um pulo por parada por dia. Tocar duas vezes no mesmo botao nao vira dois
-- pulos — o que, com teto de dois por rota, encerraria a rota por engano.
create unique index if not exists route_skips_um_por_dia
  on public.route_skips (user_id, report_id, dia);

create index if not exists route_skips_por_dia_idx
  on public.route_skips (user_id, dia);

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 4 — RLS
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.report_audit_requests enable row level security;
alter table public.route_skips           enable row level security;

-- Auditoria: quem abriu ve o proprio pedido; a moderacao ve todos.
--
-- NAO E LEITURA PUBLICA, E ISSO IMPORTA
--
-- `risco_no_local` mora nesta tabela. Uma policy de select liberada faria
-- qualquer pessoa listar onde outros se sentiram inseguros — que e um mapa de
-- onde ninguem esta olhando, publicado pelo proprio app.
drop policy if exists report_audit_requests_select on public.report_audit_requests;
create policy report_audit_requests_select on public.report_audit_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or exists (
      select 1 from public.reports r
      where r.id = report_id
        and r.city_id is not null
        and public.is_ambassador_of(auth.uid(), r.city_id)
    )
  );

drop policy if exists report_audit_requests_insert on public.report_audit_requests;
create policy report_audit_requests_insert on public.report_audit_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- So a moderacao fecha. Quem abriu nao decide o desfecho do proprio pedido.
drop policy if exists report_audit_requests_moderacao_update on public.report_audit_requests;
create policy report_audit_requests_moderacao_update on public.report_audit_requests
  for update to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or exists (
      select 1 from public.reports r
      where r.id = report_id
        and r.city_id is not null
        and public.is_ambassador_of(auth.uid(), r.city_id)
    )
  )
  with check (true);

-- Pulos: so o dono. Ninguem precisa saber quais paradas o vizinho pulou, e
-- `risco_no_local` aparece aqui pelo mesmo motivo da tabela acima.
drop policy if exists route_skips_own on public.route_skips;
create policy route_skips_own on public.route_skips
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 5 — GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

grant select, insert, update on public.report_audit_requests to authenticated;
grant select, insert on public.route_skips to authenticated;
grant usage, select on sequence public.report_audit_requests_id_seq to authenticated;
grant usage, select on sequence public.route_skips_id_seq to authenticated;

notify pgrst, 'reload schema';
