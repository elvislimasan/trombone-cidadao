import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a caixa municipal pagina e filtra no banco', async () => {
  const page = await read('src/pages/AgencyDashboardPage.jsx');
  const filters = await read('src/lib/agencyCaseFilters.js');

  assert.match(page, /const PAGE_SIZE = 25/);
  assert.match(page, /searchParams\.get\('ordem'\) \|\| 'antigas'/);
  assert.match(page, /createAgencyCasesQuery\(supabase/);
  assert.match(filters, /from\('orgao_casos'\)/);
  assert.match(filters, /\.order\('updated_at', \{ ascending: false \}\)/);
  assert.match(filters, /\.order\('report_id', \{ ascending: true \}\)/);
  assert.match(page, /\.range\(from, to\)/);
  assert.match(page, /rpc\('resumo_casos_prefeitura'/);
  assert.match(page, /listRequestSequence/);
});

test('cada bronca abre uma rota propria de atendimento', async () => {
  const [app, queue, detail] = await Promise.all([
    read('src/App.jsx'),
    read('src/pages/AgencyDashboardPage.jsx'),
    read('src/pages/AgencyCaseDetailsPage.jsx'),
  ]);

  assert.match(app, /path="\/prefeitura\/broncas\/:reportId"/);
  assert.match(queue, /`\/prefeitura\/broncas\/\$\{item\.report_id\}/);
  assert.match(detail, /Fluxo do atendimento/);
  assert.match(detail, /rpc\('encaminhar_caso_do_orgao'/);
});

test('a migration limita a fila por RLS e possui indices de paginacao', async () => {
  const migration = await read('supabase/migrations/270_painel_gestao_prefeituras.sql');

  assert.match(migration, /create or replace function public\.listar_casos_prefeitura/);
  assert.match(migration, /returns setof public\.orgao_casos[\s\S]*?security invoker/);
  assert.match(migration, /orgao_casos_paginacao_canal_idx/);
  assert.match(migration, /orgao_casos_prazo_aberto_idx/);
  assert.match(migration, /caso\.report_id = orgao_caso_eventos\.report_id/);
  assert.match(migration, /atribuido_a = case[\s\S]*?canal_id is distinct from excluded\.canal_id then null/);
  assert.match(migration, /revoke all on function public\.listar_casos_prefeitura/);
});
