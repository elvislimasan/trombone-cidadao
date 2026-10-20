import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TREE, filterTrees, treePayload, treesCsv, treeMapMarkerKey } from '../lib/arborization.js';
import { loadReportMapTrees, nearbyTrees, treeNeighborhoodCounts, treeTimeline, treeRequestCounts, treeReportSelection, uploadTreePhoto } from '../lib/treeInventory.js';

test('relatórios combinam plantio municipal por ano, bairro, sítio histórico e idade estimada', () => {
  const trees = [
    { id: 1, status: 'saudavel', neighborhood: 'Centro', planted_by: 'prefeitura', planted_at: '2025-03-01', estimated_birth_year: 1900, is_historic_site: true },
    { id: 2, status: 'saudavel', neighborhood: 'Centro', planted_by: 'comunidade', planted_at: '2025-03-01', estimated_birth_year: 2025, is_historic_site: true },
    { id: 3, status: 'removida', neighborhood: 'Centro', planted_by: 'prefeitura', planted_at: '2024-03-01', estimated_birth_year: 1900, is_historic_site: true },
    { id: 4, status: 'saudavel', neighborhood: 'Centro', created_at: '1900-01-01', is_historic_site: true },
  ];
  assert.deepEqual(filterTrees(trees, { plantedBy: 'prefeitura', plantedYear: '2025' }).map(row => row.id), [1]);
  assert.deepEqual(filterTrees(trees, { historic: 'yes', centenarian: 'yes', neighborhood: 'Centro' }).map(row => row.id), [1]);
  assert.equal(treePayload({ ...EMPTY_TREE, common_name: 'Ipê', latitude: -8, longitude: -38, estimated_birth_year: 1900 }, 64).estimated_birth_year, 1900);
  assert.throws(() => treePayload({ ...EMPTY_TREE, common_name: 'Ipê', latitude: -8, longitude: -38, estimated_birth_year: new Date().getFullYear() + 1 }, 64));
  assert.ok(treesCsv(trees).includes('Ano de nascimento estimado'));
});

test('contagem inclui bairros sem cadastros, reúne grafias e exclui árvores removidas', () => {
  assert.deepEqual(treeNeighborhoodCounts([
    { neighborhood: ' Centro ', status: 'saudavel' }, { neighborhood: 'CENTRO', status: 'atencao' },
    { neighborhood: 'Centro', status: 'removida' }, { neighborhood: null, status: 'saudavel' },
  ], [{ name: 'Centro' }, { name: 'Vila Nova' }]), [{ name: 'Centro', count: 2 }, { name: 'Vila Nova', count: 0 }]);
});

test('faixa de idade usa nascimento estimado, inclui limites e exclui idades desconhecidas', () => {
  const year = new Date().getFullYear();
  const trees = [
    { id: 1, estimated_birth_year: year },
    { id: 2, estimated_birth_year: year - 10 },
    { id: 3, estimated_birth_year: year - 100 },
    { id: 4, estimated_birth_year: null, planted_at: '1900-01-01', created_at: '1900-01-01' },
    { id: 5, estimated_birth_year: '' },
    { id: 6, estimated_birth_year: year + 1 },
  ];
  assert.deepEqual(filterTrees(trees, { minAge: '10', maxAge: '100' }).map(row => row.id), [2, 3]);
  assert.deepEqual(filterTrees(trees, { maxAge: '0' }).map(row => row.id), [1]);
  assert.deepEqual(filterTrees(trees, { minAge: '100' }).map(row => row.id), [3]);
  assert.equal(filterTrees(trees).length, 6);
});

test('árvores próximas respeitam o raio, coordenadas válidas e o inventário ativo', () => {
  const trees = [{ id: 1, latitude: -8, longitude: -38, status: 'saudavel' },
    { id: 2, latitude: -8.0002, longitude: -38, status: 'atencao' },
    { id: 3, latitude: -8.002, longitude: -38, status: 'saudavel' },
    { id: 4, latitude: -8, longitude: -38, status: 'removida' },
    { id: 5, latitude: null, longitude: null, status: 'saudavel' }];
  assert.deepEqual(nearbyTrees(trees, { lat: -8, lng: -38 }).map(row => row.id), [1, 2]);
  assert.deepEqual(nearbyTrees(trees, null), []);
});

test('seleção pelo mapa ancora a bronca na árvore e descarta rascunho de novo cadastro', () => {
  const tree = { id: 't1', city_id: 64, common_name: 'Caraibeira', address: 'Praça Central', latitude: '-8.597', longitude: '-38.574' };
  assert.deepEqual(treeReportSelection(tree), { tree_id: 't1', tree_label: 'Caraibeira', tree_registration: null, tree_photo_file: null,
    location: { lat: -8.597, lng: -38.574 }, city_id: 64, address: 'Praça Central' });
  for (const invalid of [{ status: 'removida' }, { latitude: null }, { longitude: 181 }, { latitude: 'ausente' }, { city_id: null }]) {
    assert.equal(treeReportSelection({ ...tree, ...invalid }), null);
  }
});

test('marcador amarelo representa seleção ou bronca vinculada sem alterar o cadastro da árvore', () => {
  const tree = { status: 'saudavel', service_requests: 0 };
  assert.equal(treeMapMarkerKey(tree), 'saudavel');
  assert.equal(treeMapMarkerKey(tree, true), 'linked');
  assert.equal(treeMapMarkerKey({ ...tree, service_requests: 1 }), 'linked');
  assert.equal(treeMapMarkerKey({ ...tree, status: 'risco' }), 'risco');
  assert.equal(treeMapMarkerKey({ status: 'removida', service_requests: 1 }), 'removida');
  assert.deepEqual(tree, { status: 'saudavel', service_requests: 0 });
});

test('árvores para bronca são consultadas por área visível, com cidade e paginação em todas as páginas', async () => {
  const calls = [];
  const client = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const query = { select: () => query, order: () => query,
      neq: (key, value) => { call.filters.push(['neq', key, value]); return query; },
      eq: (key, value) => { call.filters.push(['eq', key, value]); return query; },
      gte: (key, value) => { call.filters.push(['gte', key, value]); return query; },
      lte: (key, value) => { call.filters.push(['lte', key, value]); return query; },
      range: (start, end) => { call.range = [start, end]; return query; },
      then: resolve => Promise.resolve({ data: Array.from({ length: call.range[0] === 0 ? 1000 : 2 }, (_, id) => ({ id })), error: null }).then(resolve) };
    return query;
  } };
  assert.equal((await loadReportMapTrees(client, { south: -8.61, north: -8.58, west: -38.59, east: -38.55 }, 64)).length, 1002);
  assert.ok(calls.every(call => call.table === 'city_trees' && JSON.stringify(call.filters) === JSON.stringify([
    ['neq', 'status', 'removida'], ['gte', 'latitude', -8.61], ['lte', 'latitude', -8.58], ['gte', 'longitude', -38.59], ['lte', 'longitude', -38.55], ['eq', 'city_id', 64],
  ])));
  assert.deepEqual(calls.map(call => call.range), [[0, 999], [1000, 1999]]);
  assert.deepEqual(await loadReportMapTrees({}, null, 64), []);
});

test('linha do tempo separa solicitação, serviço municipal e conclusão ainda não confirmada', () => {
  const timeline = treeTimeline({ created_at: '2026-01-01T10:00:00Z' },
    [{ id: 'care', performed_on: '2026-02-01', service_type: 'poda' }],
    [{ id: 'report', created_at: '2026-01-10T10:00:00Z', tree_service: 'poda', title: 'Galhos', status: 'pending_resolution' }],
    [{ id: 'update', report_id: 'report', created_at: '2026-02-02T10:00:00Z', update_type: 'solved', description: 'Poda relatada' }]);
  assert.equal(timeline.length, 4);
  assert.equal(timeline[0].title, 'Conclusão informada na bronca');
  assert.match(timeline[0].description, /Aguardando confirmação/);
  assert.equal(timeline[1].source, 'Equipe municipal');
  assert.equal(timeline[2].title, 'Solicitação de Poda');
  assert.equal(timeline[3].title, 'Árvore cadastrada na plataforma');
});

test('foto é opcional e rejeita tipo/tamanho inválido antes de acessar storage', async () => {
  const client = { auth: { getUser() { assert.fail('Não deve acessar autenticação'); } } };
  assert.equal(await uploadTreePhoto(client, null, 64), null);
  await assert.rejects(uploadTreePhoto(client, { type: 'image/svg+xml', size: 100 }, 64), /JPG, PNG ou WebP/);
  await assert.rejects(uploadTreePhoto(client, { type: 'image/jpeg', size: 6 * 1024 * 1024 }, 64), /5 MB/);
});

test('upload usa pasta da cidade e do usuário, mantendo tipo da foto e URL pública', async () => {
  const file = new File(['photo'], 'tree.png', { type: 'image/png' });
  let receivedPath;
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-id' } } }) }, storage: { from(bucket) {
    assert.equal(bucket, 'tree-photos');
    return {
      async upload(path, received, options) { receivedPath = path; assert.equal(received, file); assert.deepEqual(options, { contentType: 'image/png', upsert: false }); return { error: null }; },
      getPublicUrl(path) { return { data: { publicUrl: `https://storage.example/${path}` } }; },
    };
  } } };
  const result = await uploadTreePhoto(client, file, 64);
  assert.match(receivedPath, /^64\/user-id\/[a-f0-9-]+\.png$/);
  assert.equal(result.path, receivedPath);
  assert.equal(result.url, `https://storage.example/${receivedPath}`);
});

test('erro de permissão, bucket ausente e sessão expirada têm mensagens específicas', async () => {
  const file = new File(['photo'], 'tree.jpg', { type: 'image/jpeg' });
  for (const [uploadError, expected] of [
    [{ message: 'new row violates row-level security policy', statusCode: '403' }, /regra de acesso/],
    [{ message: 'Bucket not found', statusCode: '404' }, /não está configurado/],
    [{ message: 'Failed to fetch' }, /conexão/],
  ]) {
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-id' } } }) }, storage: { from: () => ({ upload: async () => ({ error: uploadError }) }) } };
    await assert.rejects(uploadTreePhoto(client, file, 64), expected);
  }
  await assert.rejects(uploadTreePhoto({ auth: { getUser: async () => ({ data: null, error: { message: 'expired' } }) } }, file, 64), /sessão expirou/);
});

test('indicadores de solicitações carregam além das primeiras mil árvores', async () => {
  const ranges = [];
  const client = { rpc(name, args) {
    assert.equal(name, 'city_tree_request_counts'); assert.equal(args.p_city_id, 64);
    let start;
    const q = { order() { return q; }, range(first, last) { start = first; ranges.push([first, last]); return q; },
      then(resolve) { return Promise.resolve({ data: Array.from({ length: start === 0 ? 1000 : 1 }, (_, i) => ({ tree_id: `${start + i}`, total: 2 })) }).then(resolve); } };
    return q;
  } };
  const counts = await treeRequestCounts(client, 64);
  assert.equal(counts.size, 1001); assert.equal(counts.get('1000').total, 2);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});
