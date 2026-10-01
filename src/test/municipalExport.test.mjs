import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_DEFAULT_FILTERS, collectExportRows, loadMunicipalExport, selectPageRecords } from '../lib/municipalExport.js';
import { createMunicipalServiceOrder, loadMunicipalServiceOrder, loadServiceOrderSelection, serviceOrderCoordinates } from '../lib/municipalServiceOrder.js';
import { municipalExportCsv, buildMunicipalExportPdf } from '../utils/municipalExport.js';
import { buildServiceOrderPdf } from '../utils/municipalServiceOrderPdf.js';

const context = { userId: 'gestor', userName: 'Gestor Municipal', canEdit: true, isAdministrator: true, municipality: { id: 'prefeitura', city_id: 1, nome: 'Prefeitura de Floresta', cidade: { name: 'Floresta', states: { uf: 'PE' } } }, categories: [{ id: 'iluminacao', name: 'Iluminação' }], channels: [{ id: 'setor', nome: 'Infraestrutura' }], members: [], serviceRules: [] };

function fakeClient(tables, { cap = 500, linkError, saveError, saveResult } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      let rows = tables[table] || [];
      let start = 0; let end = Infinity; let signal; let single = false;
      const orders = [];
      const query = {
        select() { return query; },
        eq(key, value) { rows = rows.filter((item) => item[key] === value); return query; },
        in(key, values) { rows = rows.filter((item) => values.includes(item[key])); return query; },
        is(key, value) { rows = rows.filter((item) => (item[key] ?? null) === value); return query; },
        not(key, _op, value) { rows = rows.filter((item) => (item[key] ?? null) !== value); return query; },
        gte(key, value) { rows = rows.filter((item) => item[key] >= value); return query; },
        lt(key, value) { rows = rows.filter((item) => item[key] < value); return query; },
        or(value) { if (value.includes('ilike')) { const term = value.split('.ilike.%')[1].split('%')[0].toLowerCase(); rows = rows.filter((item) => Object.values(item).some((field) => typeof field === 'string' && field.toLowerCase().includes(term))); } return query; },
        order(key, options = {}) { orders.push([key, options.ascending !== false, options.nullsFirst]); return query; },
        range(from, to) { start = from; end = to; return query; },
        abortSignal(value) { signal = value; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          const sorted = [...rows].sort((a, b) => {
            for (const [key, ascending, nullsFirst] of orders) {
              if (a[key] !== b[key]) {
                if (a[key] == null || b[key] == null) return (a[key] == null ? 1 : -1) * (nullsFirst ? -1 : 1);
                return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
              }
            }
            return 0;
          });
          return Promise.resolve(signal?.aborted ? { error: new Error('Aborted') } : { data: single ? sorted[0] || null : sorted.slice(start, Math.min(end + 1, start + cap)), count: rows.length }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(name, args) {
      calls.push({ name, args });
      const value = name === 'salvar_demanda_municipal' ? { data: saveResult, error: saveError } : { data: (tables.links || []).filter((link) => args.p_reports.includes(link.report_id)), error: linkError };
      const promise = Promise.resolve(value);
      promise.abortSignal = () => promise;
      return promise;
    },
  };
}

function demand(index, overrides = {}) {
  return { id: String(index).padStart(4, '0'), prefeitura_id: 'prefeitura', protocolo: 'DEM-' + index, titulo: 'Serviço ' + index, created_at: '2026-09-28T10:00:00Z', updated_at: '2026-09-28T10:00:00Z', status: 'aberta', prioridade: 'normal', ...overrides };
}
function report(index, overrides = {}) {
  return { id: String(index).padStart(4, '0'), city_id: 1, title: 'Poste apagado ' + index, status: 'pending', category_id: 'iluminacao', category: { name: 'Iluminação' }, created_at: '2026-09-28T10:00:00Z', ...overrides };
}
const exportOptions = { municipalityId: 'prefeitura', cityId: 1, userId: 'gestor', filters: { ...EXPORT_DEFAULT_FILTERS } };

test('exportação cobre mais de mil registros mesmo se o servidor reduzir o tamanho dos lotes', async () => {
  const rows = Array.from({ length: 1257 }, (_, index) => demand(index));
  rows.push(demand(2000, { prefeitura_id: 'outra' }));
  const client = fakeClient({ demandas_municipais: rows }, { cap: 137 });
  const all = await loadMunicipalExport(client, { ...exportOptions, kind: 'demands' });
  assert.equal(all.length, 1257);
  assert.equal(new Set(all.map((item) => item.id)).size, 1257);
  assert.equal(all.at(-1).id, '1256');
});

test('exportação da ordem consulta e mantém todos os endereços vinculados em lotes', async () => {
  const orders = [demand(1, { endereco: null, bairro: null }), demand(2, { endereco: 'Ponto de apoio' })];
  const links = Array.from({ length: 257 }, (_, index) => ({
    demanda_id: orders[index % 2].id, report_id: String(index),
    report: { id: String(index), title: `Bronca ${index}`, address: `Rua vinculada ${index}`, neighborhood: 'Centro' },
  }));
  const result = await loadMunicipalExport(fakeClient({ demandas_municipais: orders, demanda_broncas: links }, { cap: 37 }), { ...exportOptions, kind: 'demands' });
  const first = result.find((item) => item.id === orders[0].id);
  const second = result.find((item) => item.id === orders[1].id);
  assert.equal(first.linkedLocations.length, 129);
  assert.equal(second.linkedLocations.length, 128);
  assert.equal(first.address.split('; ').length, 129);
  assert.equal(second.address, 'Ponto de apoio');
  assert.ok(first.linkedLocations.some((location) => location.address === 'Rua vinculada 256'));
  assert.ok(municipalExportCsv(result, 'demands').includes('Endereços vinculados'));
  assert.ok(municipalExportCsv(result, 'demands').includes('Rua vinculada 256'));
});

test('selecionar e desmarcar uma página preserva as seleções feitas em outras páginas e filtros', () => {
  assert.deepEqual(selectPageRecords(['a', 'b'], ['b', 'c'], true), ['a', 'b', 'c']);
  assert.deepEqual(selectPageRecords(['a', 'b', 'c'], ['b', 'c'], false), ['a']);
});

test('seleção em lote evita URLs grandes e mantém a ordenação global após juntar os lotes', async () => {
  const rows = Array.from({ length: 221 }, (_, index) => demand(index));
  const client = fakeClient({ demandas_municipais: rows });
  const selectedIds = rows.map((item) => item.id).reverse();
  const selected = await loadMunicipalExport(client, { ...exportOptions, kind: 'demands', scope: 'selected', selectedIds });
  assert.equal(selected.length, 221);
  assert.equal(selected[0].id, '0000');
  assert.equal(selected.at(-1).id, '0220');
});

test('status múltiplos, responsável, setor, categoria, bairro e período funcionam em conjunto', async () => {
  const base = { atribuido_a: 'equipe', canal_id: 'setor', category_id: 'iluminacao', bairro: 'Centro', created_at: new Date(2026, 8, 29, 23, 59).toISOString() };
  const rows = [demand(1, base), demand(2, { ...base, status: 'em_andamento' }), demand(3, { ...base, status: 'concluida' }), demand(4, { ...base, atribuido_a: 'outro' }), demand(5, { ...base, created_at: new Date(2026, 8, 30).toISOString() })];
  const result = await loadMunicipalExport(fakeClient({ demandas_municipais: rows }), { ...exportOptions, kind: 'demands', filters: { ...EXPORT_DEFAULT_FILTERS, statuses: ['aberta', 'em_andamento'], responsible: 'equipe', channel: 'setor', category: 'iluminacao', neighborhood: 'Centro', dateFrom: '2026-09-29', dateTo: '2026-09-29' } });
  assert.deepEqual(result.map((item) => item.id), ['0001', '0002']);
});

test('exportação de broncas cobre todas as páginas e consulta vínculos antes de filtrar', async () => {
  const rows = Array.from({ length: 1105 }, (_, index) => report(index));
  const links = rows.filter((_, index) => index % 3 === 0).map((item) => ({ report_id: item.id, demanda_id: null, protocolo: 'DEM-' + item.id }));
  const client = fakeClient({ reports: rows, links });
  const result = await loadMunicipalExport(client, { ...exportOptions, kind: 'reports', filters: { ...EXPORT_DEFAULT_FILTERS, orderLink: 'unlinked' } });
  assert.equal(result.length, 736);
  assert.equal(result.some((item) => links.some((link) => link.report_id === item.id)), false);
  assert.deepEqual(client.calls.map((call) => call.args.p_reports.length), [500, 500, 105]);
});

test('responsável de bronca vem da ordem e um vínculo restrito não é classificado como sem responsável', async () => {
  const reports = [report(1), report(2), report(3), report(4)];
  const tables = { reports, links: [{ report_id: '0001', demanda_id: 'os1', protocolo: 'DEM-1' }, { report_id: '0002', demanda_id: null, protocolo: 'DEM-2' }, { report_id: '0003', demanda_id: 'os3', protocolo: 'DEM-3' }], demandas_municipais: [{ id: 'os1', prefeitura_id: 'prefeitura', atribuido_a: 'equipe', responsavel: { name: 'João' }, canal_id: 'setor' }, { id: 'os3', prefeitura_id: 'prefeitura', atribuido_a: null }] };
  const assigned = await loadMunicipalExport(fakeClient(tables), { ...exportOptions, kind: 'reports', filters: { ...EXPORT_DEFAULT_FILTERS, responsible: 'equipe' } });
  assert.deepEqual(assigned.map((item) => item.id), ['0001']);
  const unassigned = await loadMunicipalExport(fakeClient(tables), { ...exportOptions, kind: 'reports', filters: { ...EXPORT_DEFAULT_FILTERS, responsible: 'unassigned' } });
  assert.deepEqual(unassigned.map((item) => item.id), ['0003', '0004']);
});

test('falhas e cancelamento interrompem a exportação sem produzir um arquivo incompleto', async () => {
  await assert.rejects(loadMunicipalExport(fakeClient({ reports: [report(1)] }, { linkError: new Error('Falha nos vínculos') }), { ...exportOptions, kind: 'reports' }), /Falha nos vínculos/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(collectExportRows(() => { throw new Error('Não deveria consultar'); }, { signal: controller.signal }), /cancelada/);
});

test('prévia recupera campos de iluminação, vínculos e ocorrências indisponíveis', async () => {
  const selection = await loadServiceOrderSelection(fakeClient({ reports: [report(1, { pole_id: 64, location: { coordinates: [-38.56, -8.60] } })], poles: [{ id: 64, city_id: 1, identifier: 'P-64' }], links: [{ report_id: '0001', protocolo: 'DEM-1' }] }), context, ['0001', '0002']);
  assert.equal(selection[0].report.pole.identifier, 'P-64');
  assert.equal(selection[0].link.protocolo, 'DEM-1');
  assert.equal(selection[1].report, undefined);
  assert.equal(serviceOrderCoordinates(selection[0].report), '-8.600000, -38.560000');
  assert.equal(serviceOrderCoordinates({ pole: { latitude: null, longitude: null } }), 'Não informado');
});

test('criação vincula todas as ocorrências na transação existente e bloqueia as já vinculadas', async () => {
  const client = fakeClient({}, { saveResult: { id: 'os', protocolo: 'DEM-OFICIAL' } });
  const options = { context, id: 'os', selection: [{ id: '0001', report: report(1) }, { id: '0002', report: report(2) }], title: 'Ronda de iluminação', channelId: 'setor', responsibleId: '', priority: 'alta', observation: 'Levar material' };
  assert.equal((await createMunicipalServiceOrder(client, options)).protocolo, 'DEM-OFICIAL');
  assert.equal(client.calls[0].name, 'salvar_demanda_municipal');
  assert.deepEqual(client.calls[0].args.p_reports, ['0001', '0002']);
  assert.equal(client.calls[0].args.p_dados.descricao, 'Levar material');
  assert.equal(client.calls[0].args.p_dados.status, 'aberta');
  await assert.rejects(createMunicipalServiceOrder(client, { ...options, selection: [{ ...options.selection[0], link: { protocolo: 'OS-existente' } }] }), /Remova/);
  assert.equal(client.calls.length, 1);
});

test('uma resposta de gravação perdida recupera a mesma ordem, sem gerar outra', async () => {
  const saved = demand(1, { id: 'os', criado_por: 'gestor' });
  const client = fakeClient({ demandas_municipais: [saved], demanda_broncas: [{ demanda_id: 'os', report_id: '0001' }] }, { saveError: new Error('Resposta perdida') });
  const result = await createMunicipalServiceOrder(client, { context, id: 'os', selection: [{ id: '0001', report: report(1) }], title: 'Ronda de iluminação', channelId: 'setor', priority: 'normal', observation: '' });
  assert.equal(result.id, 'os');
  assert.equal(client.calls.length, 1);
});

test('a geração em lote preserva a atribuição opcional para administradores e a permissão de setor para operadores', async () => {
  const client = fakeClient({}, { saveResult: { id: 'os', protocolo: 'DEM-OFICIAL' } });
  const options = { context, id: 'os', selection: [{ id: '0001', report: report(1) }], title: 'Atendimento a distribuir', channelId: '', responsibleId: '', priority: 'normal', observation: '' };
  assert.equal((await createMunicipalServiceOrder(client, options)).id, 'os');
  assert.equal(client.calls[0].args.p_dados.canal_id, null);
  await assert.rejects(createMunicipalServiceOrder(client, { ...options, context: { ...context, isAdministrator: false, editableChannelIds: ['setor'] } }), /Escolha uma secretaria/);
  await assert.rejects(createMunicipalServiceOrder(client, { ...options, channelId: 'outro-setor', context: { ...context, isAdministrator: false, editableChannelIds: ['setor'] } }), /Escolha uma secretaria/);
  assert.equal(client.calls.length, 1);
});

test('reimpressão carrega todos os vínculos de uma ordem grande, inclusive broncas concluídas', async () => {
  const links = Array.from({ length: 1037 }, (_, index) => ({ demanda_id: 'os', report_id: String(index), report: report(index, { status: 'resolved' }) }));
  const result = await loadMunicipalServiceOrder(fakeClient({ demandas_municipais: [demand(1, { id: 'os' })], demanda_broncas: links }, { cap: 127 }), context, 'os');
  assert.equal(result.reports.length, 1037);
});

test('CSV preserva acentos, separadores e quebras de linha e neutraliza fórmulas', () => {
  const csv = municipalExportCsv([{ id: '1', title: ' =SUM(1;2)', description: 'Ação\n"teste"', category: 'Iluminação', address: 'Rua; A', createdAt: '2026-09-29' }], 'reports');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('Iluminação'));
  assert.ok(csv.includes('"\' =SUM(1;2)"'));
  assert.ok(csv.includes('"Ação\n""teste"""'));
});

test('PDF de campo usa A4, número oficial, paginação e formulário de execução', async () => {
  const order = demand(1, { protocolo: 'OS-2026-00128', criado_por: 'gestor', criador: { name: 'Maria Gestora' }, secretaria: { nome: 'Infraestrutura' } });
  const reports = Array.from({ length: 48 }, (_, index) => report(index, { description: 'Executar vistoria e manutenção do poste.', address: 'Rua José do Carmo', neighborhood: 'Caetano II', pole_number: 'P-64', location: { coordinates: [-38.56, -8.60] } }));
  const doc = await buildServiceOrderPdf({ order, reports, municipality: context.municipality });
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 297) < 1);
  const pdf = doc.output();
  assert.ok(pdf.includes('OS-2026-00128'));
  assert.ok(pdf.includes('ORDEM DE SERVIÇO'));
  assert.ok(pdf.includes('Responsável pela execução'));
  assert.ok(pdf.includes('Assinatura:'));
  assert.ok(pdf.includes('-8.600000'));
  assert.ok(pdf.includes('Poste: P-64'));
  assert.ok(pdf.includes('Página 1 de '));
});

test('relatório PDF repete cabeçalho e exporta fichas com descrições longas em várias páginas', async () => {
  const doc = await buildMunicipalExportPdf({ records: [{ id: '1', reference: 'DEM-1', title: 'Atendimento', status: 'Aberta', category: 'Iluminação', address: 'Rua A', neighborhood: 'Centro', channel: 'Infraestrutura', responsible: 'Sem responsável', description: 'Descrição longa de uma vistoria. '.repeat(350) }], kind: 'demands', municipality: context.municipality, layout: 'details' });
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(doc.output().includes('DEM-1'));
  assert.ok(doc.output().includes('Página 2 de'));
});

test('PDF geral e fichas listam endereços vinculados com paginação para muitas ordens', async () => {
  const records = Array.from({ length: 60 }, (_, index) => ({
    id: String(index), reference: `DEM-${index}`, title: `Serviço ${index}`, category: 'Poda',
    address: 'Endereço não informado', neighborhood: 'Bairro não informado', status: 'Aberta', priority: 'Normal',
    channel: 'Agricultura', responsible: 'Equipe', linkedLocations: Array.from({ length: 4 }, (_, location) => ({
      id: `${index}-${location}`, title: `Bronca ${location + 1}`, address: `Rua ${index}-${location}`, neighborhood: 'Centro',
    })),
  }));
  const overview = await buildMunicipalExportPdf({ records, kind: 'demands', municipality: context.municipality });
  const overviewText = overview.output();
  assert.ok(overview.getNumberOfPages() > 1);
  assert.ok(overviewText.includes('Endereços das solicitações vinculadas'));
  assert.ok(overviewText.includes('Rua 0-0'));
  assert.ok(overviewText.includes('Rua 59-3'));
  assert.ok(overviewText.includes('Página 2 de'));
  const details = await buildMunicipalExportPdf({ records: records.slice(0, 2), kind: 'demands', municipality: context.municipality, layout: 'details' });
  assert.ok(details.output().includes('Rua 1-3'));
});

test('relatório de broncas prioriza a tabela e preserva IDs em 1, 10, 50 e mais de 100 registros', async () => {
  for (const count of [1, 10, 50, 125]) {
    const records = Array.from({ length: count }, (_, index) => ({ id: String(index), reference: 'BR-' + index, title: 'Poste apagado', category: 'Iluminação', address: 'Rua A, 120', neighborhood: 'Caetano II', status: count === 1 ? 'Aberta' : index % 2 ? 'Aberta' : 'Em andamento', createdAt: '2026-09-29T12:00:00Z', age: 5, orderReference: 'Sem ordem', channel: 'Infraestrutura', responsible: 'João Silva' }));
    const doc = await buildMunicipalExportPdf({ records, kind: 'reports', municipality: context.municipality, filterSummary: [['Status', count === 1 ? 'Aberta' : 'Todas em aberto'], ['Categoria', 'Iluminação'], ['Bairro', 'Caetano II'], ['Abrangência', 'Todas as páginas']] });
    const pdf = doc.output();
    assert.ok(pdf.includes('Filtros aplicados'));
    assert.ok(pdf.includes('Categoria: Iluminação'));
    assert.ok(pdf.includes('Bairro: Caetano II'));
    assert.ok(pdf.includes('ID'));
    assert.ok(pdf.includes('BR-' + (count - 1)));
    if (count === 1) { assert.equal(doc.getNumberOfPages(), 1); assert.equal(pdf.includes('Distribuição por status'), false); }
    else assert.ok(pdf.includes('Distribuição por status'));
    if (count > 50) assert.ok(doc.getNumberOfPages() > 1);
  }
});
