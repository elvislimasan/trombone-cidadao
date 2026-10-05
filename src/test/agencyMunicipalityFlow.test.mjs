import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('demandas têm rota, tabela própria e vínculo opcional com bronca', async () => {
  const [app, page, drawer, migration, queries] = await Promise.all([
    read('src/App.jsx'),
    read('src/pages/MunicipalDemandsPage.jsx'),
    read('src/components/municipality/MunicipalDemandDrawer.jsx'),
    read('supabase/migrations/274_demandas_municipais_iluminacao.sql'),
    read('src/lib/municipalExport.js'),
  ]);
  assert.match(app, /path="\/prefeitura\/visao-geral"/);
  assert.match(app, /path="\/prefeitura\/demandas\/nova"/);
  assert.match(page, /municipalDemandsQuery/);
  assert.match(queries, /from\('demandas_municipais'\)/);
  assert.match(page, /MunicipalDemandDrawer/);
  assert.match(drawer, /p_reports: reports\.map/);
  assert.match(drawer, /rpc\('salvar_demanda_municipal'/);
  assert.match(page, /MunicipalExportDialog/);
  assert.match(migration, /create table public\.demandas_municipais/);
  assert.match(migration, /report_id uuid references public\.reports\(id\) on delete set null/);
  assert.match(migration, /create unique index demandas_municipais_bronca_unica/);
  assert.match(migration, /create policy demandas_municipais_select/);
  assert.match(migration, /resumo_demandas_municipais/);
});

test('broncas são consultadas separadamente e podem vincular uma ordem explícita', async () => {
  const [app, reports, drawer, map] = await Promise.all([
    read('src/App.jsx'),
    read('src/pages/MunicipalReportsPage.jsx'),
    read('src/components/municipality/MunicipalReportDrawer.jsx'),
    read('src/components/municipality/MunicipalReportsMap.jsx'),
  ]);
  assert.match(app, /path="\/prefeitura\/broncas"[^\n]*MunicipalReportsPage/);
  assert.match(app, /path="\/prefeitura\/broncas\/:reportId"[^\n]*MunicipalReportsPage/);
  assert.match(reports, /MunicipalReportDrawer/);
  assert.match(drawer, /Abrir ordem de serviço/);
  assert.match(drawer, /vinculos_broncas_prefeitura/);
  assert.match(drawer, /LocationMap/);
  assert.match(map, /Concentração de solicitações abertas/);
  assert.match(reports, /onCreateDemand=\{\(id\) => \{ closeReport\(\); setSelectedIds\(\[id\]\); setServiceOrderOpen\(true\); \}\}/);
  assert.match(reports, /Gerar Ordem de Serviço/);
  assert.doesNotMatch(reports, /MunicipalExportDialog|Exportar relatório|Exportar selecionadas/);
  assert.doesNotMatch(reports, /atualizar_caso_do_orgao|encaminhar_caso_do_orgao/);
});

test('iluminação registra alterações e exporta histórico para PDF e planilha', async () => {
  const [app, page, migration] = await Promise.all([
    read('src/App.jsx'),
    read('src/pages/MunicipalLightingPage.jsx'),
    read('supabase/migrations/274_demandas_municipais_iluminacao.sql'),
  ]);
  assert.match(app, /path="\/prefeitura\/iluminacao"/);
  assert.match(page, /rpc\('gerir_iluminacao_municipal_detalhado'/);
  assert.match(page, /from\('pole_lighting_changes'\)/);
  assert.match(page, /pdf\.autoTable/);
  assert.match(page, /text\/csv/);
  assert.match(migration, /old_power_w numeric\(8,2\)/);
  assert.match(migration, /new_power_w numeric\(8,2\)/);
  assert.match(migration, /m\.papel = 'gestor'/);
});
