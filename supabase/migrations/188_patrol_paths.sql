-- 188_patrol_paths.sql
--
-- O percurso passa a ser guardado — e nunca sai daqui.
--
-- POR QUE ELE NAO ERA GRAVADO ATE AGORA
--
-- Nao foi esquecimento. Esta decisao esta escrita em dois lugares do codigo,
-- com a mesma frase: "nao ha mapa do percurso; ele nunca foi gravado, de
-- proposito: a rota comeca e termina na casa de quem patrulha, e publica-la
-- publicaria isso" (MyPatrolsPage.jsx e PatrolPage.jsx).
--
-- A frase continua verdadeira. O que muda e que ela nao e mais motivo para nao
-- gravar — e motivo para nao COMPARTILHAR.
--
-- POR QUE UMA TABELA SEPARADA, E NAO UMA COLUNA EM `patrols`
--
-- Aqui esta a razao inteira desta migracao, e ela nao e organizacional.
--
-- `patrols` tem duas policies de leitura: `patrols_select_own` (a dona ve) e
-- `patrols_select_public` (qualquer pessoa ve, se `is_public`). RLS decide
-- LINHAS, nao colunas. Uma coluna `path` dentro de `patrols` seria visivel,
-- em toda patrulha compartilhada, para qualquer um que pedisse a coluna
-- diretamente ao PostgREST — e nao adiantaria nada a tela nao desenhar o
-- traco: o dado ja teria saido do banco.
--
-- E o que sairia e o endereco de casa de quem patrulha, deduzido do inicio e
-- do fim da linha. Uma tabela propria, com UMA policy de leitura e nenhuma
-- publica, torna esse vazamento impossivel em vez de improvavel.
--
-- POR QUE NAO TEM RECORTE DAS PONTAS
--
-- A tecnica usual (esconder o primeiro e o ultimo raio do trajeto) existe para
-- percurso que vai ser publicado. Este nao vai: a dona olhando a propria casa
-- no proprio historico nao e vazamento, e recortar so tiraria dela a parte do
-- trajeto que ela mais reconhece.
--
-- Se um dia o percurso for para o card ou para a tela publica, o recorte passa
-- a ser obrigatorio — e este comentario e o aviso.
--
-- FORMATO
--
-- `[[lng, lat], …]` em jsonb, ja simplificado no aparelho por
-- `simplificarRastro` (src/lib/navGeo.js): ~8 m de tolerancia, teto de 1200
-- pontos, 5 casas decimais. Uma patrulha urbana de 10 km cabe em poucos kB.
--
-- A ordem e a do GeoJSON — `lng` primeiro. E o contrario do que o Leaflet pede
-- e de proposito: quem um dia migrar esta coluna para `geography(linestring)`
-- encontra o que o PostGIS espera, sem inverter nada.

create table if not exists public.patrol_paths (
  -- A patrulha e a chave: uma patrulha, um percurso. Apagar o registro da
  -- patrulha leva o traco junto, que e exatamente o que a tela de historico
  -- promete no botao "Apagar".
  patrol_id  uuid primary key references public.patrols(id) on delete cascade,

  -- Redundante com patrols.user_id, e de proposito: a policy abaixo precisa
  -- decidir sem consultar outra tabela. Um join dentro de policy roda a cada
  -- linha e obriga a pensar na RLS da tabela do outro lado.
  user_id    uuid not null references public.profiles(id) on delete cascade,

  path       jsonb not null,
  points     integer not null default 0,
  created_at timestamptz not null default now(),

  constraint patrol_paths_path_e_lista check (jsonb_typeof(path) = 'array'),

  -- O teto do cliente (MAX_PONTOS_GRAVADOS = 1200) repetido como regra do
  -- banco. A folga ate 2000 e para a constraint nao virar o motivo de uma
  -- patrulha inteira nao ser gravada se o numero do cliente mudar um dia.
  constraint patrol_paths_tamanho_sao check (jsonb_array_length(path) <= 2000),

  constraint patrol_paths_points_bate check (points = jsonb_array_length(path))
);

comment on table public.patrol_paths is
  'Percurso de cada patrulha. PRIVADO SEMPRE: separado de `patrols` porque aquela tabela tem policy publica e RLS nao filtra coluna. Ver o cabecalho da 188 antes de expor isto em qualquer lugar.';

comment on column public.patrol_paths.path is
  'Rastro simplificado em [[lng, lat], …] (ordem GeoJSON). Gerado por simplificarRastro em src/lib/navGeo.js.';

alter table public.patrol_paths enable row level security;

-- ── Policies ────────────────────────────────────────────────────────────────
--
-- Uma so de leitura, e ela e a dona. Nao existe equivalente de
-- `patrols_select_public` aqui, e a ausencia e o ponto: e o que garante que
-- compartilhar uma patrulha nunca compartilha por onde se andou.

drop policy if exists patrol_paths_select_own on public.patrol_paths;
create policy patrol_paths_select_own
  on public.patrol_paths
  for select
  using (auth.uid() = user_id);

drop policy if exists patrol_paths_insert_own on public.patrol_paths;
create policy patrol_paths_insert_own
  on public.patrol_paths
  for insert
  with check (auth.uid() = user_id);

-- Update existe porque a patrulha e gravada ao encerrar e o percurso vai junto;
-- se a mesma sessao gravar de novo (a fila do resumo atualiza a linha), o
-- upsert precisa poder sobrescrever.
drop policy if exists patrol_paths_update_own on public.patrol_paths;
create policy patrol_paths_update_own
  on public.patrol_paths
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Apagar so o percurso, mantendo a patrulha: "esqueca por onde eu andei, mas
-- guarde que eu andei". O cascade de `patrols` cobre o caminho inverso.
drop policy if exists patrol_paths_delete_own on public.patrol_paths;
create policy patrol_paths_delete_own
  on public.patrol_paths
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.patrol_paths to authenticated;
