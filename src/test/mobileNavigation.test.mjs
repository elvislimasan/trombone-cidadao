import test from 'node:test';
import assert from 'node:assert/strict';
import { getMobileBackTarget, getMobileRoute } from '@/lib/mobileNavigation';
import { municipalMobileNavigation, municipalNavigationActive } from '@/lib/municipalMobileNavigation';
import { municipalCapabilities, municipalRouteAllowed } from '@/lib/municipalAccess';

test('as quatro entradas principais são raízes e mapas temáticos pertencem a Explorar', () => {
  for (const path of ['/', '/explorar', '/mapa', '/perfil']) {
    assert.equal(getMobileRoute(path).root, true, path);
    assert.equal(getMobileRoute(path).tab, path);
  }
  assert.equal(getMobileRoute('/feed').tab, '/');
  for (const path of ['/mapa-arborizacao', '/mapa-pavimentacao', '/mapa-inexistente']) {
    assert.equal(getMobileRoute(path).tab, '/explorar', path);
    assert.equal(getMobileRoute(path).root, false, path);
  }
});

test('cadastro, edição e detalhe de árvore têm título e retorno específicos', () => {
  assert.equal(getMobileRoute('/arvores-da-comunidade/nova').title, 'Cadastrar árvore');
  assert.equal(getMobileRoute('/arvores-da-comunidade/tree/editar').title, 'Editar árvore');
  assert.equal(getMobileRoute('/arvores-da-comunidade/tree/?acao=cuidar').title, 'Árvore da comunidade');
  assert.equal(getMobileRoute('/arvores-da-comunidade/tree').fallbackTo, '/arvores-da-comunidade');
  assert.equal(getMobileRoute('/arborizacao/arvore/tree').fallbackTo, '/mapa-arborizacao');
});

test('área pessoal e institucional não ativam uma aba por coincidência de prefixo', () => {
  for (const path of ['/configuracoes', '/seguindo', '/settings/notifications']) {
    assert.equal(getMobileRoute(path).tab, '/perfil', path);
  }
  assert.equal(getMobileRoute('/perfil-publico').tab, '/explorar');
  assert.equal(getMobileRoute('/prefeitura/executor/arborizacao').tab, null);
  assert.equal(getMobileRoute('/prefeitura/eletricista/ordem/1').tab, null);
});

test('voltar de link direto usa pai interno e histórico do router permite retornar à origem', () => {
  const route = getMobileRoute('/arvores-da-comunidade/tree');
  for (const history of [null, {}, { idx: 0 }, { idx: -1 }, { idx: '3' }]) {
    assert.equal(getMobileBackTarget(route, history), '/arvores-da-comunidade');
  }
  assert.equal(getMobileBackTarget(route, { idx: 2 }), -1);
  assert.equal(getMobileBackTarget(getMobileRoute('/login'), { idx: 2 }), '/');
});

test('atalhos municipais priorizam atendimento e só usam destinos disponíveis no papel', () => {
  const navigation = [
    { to: '/prefeitura/gestao-territorial', label: 'Arborização' },
    { to: '/prefeitura/equipe', label: 'Equipe' },
    { to: '/prefeitura/demandas', label: 'Ordens de serviço' },
    { to: '/prefeitura/broncas', label: 'Solicitações' },
    { to: '/prefeitura/visao-geral', label: 'Visão geral' },
  ];
  assert.deepEqual(municipalMobileNavigation(navigation).map(item => item.to), [
    '/prefeitura/visao-geral', '/prefeitura/broncas', '/prefeitura/demandas',
  ]);
  const inventory = municipalCapabilities([{ cargos: ['inventario'], atendimento: 'nenhum', especialidades_execucao: [], inventario_iluminacao: false }]);
  const visible = navigation.filter(item => municipalRouteAllowed(item.to, inventory));
  assert.deepEqual(municipalMobileNavigation(visible).map(item => item.to), ['/prefeitura/gestao-territorial']);
  assert.equal(municipalMobileNavigation(visible)[0].shortLabel, 'Arborização');
  assert.deepEqual(municipalMobileNavigation([]), []);
});

test('mapa municipal e detalhe de ordem mantêm atalho ativo sem confundir áreas', () => {
  assert.equal(municipalNavigationActive('/prefeitura/broncas', '/prefeitura/mapa'), true);
  assert.equal(municipalNavigationActive('/prefeitura/demandas', '/prefeitura/demandas/1'), true);
  assert.equal(municipalNavigationActive('/prefeitura/demandas', '/prefeitura/demandas-outras'), false);
});
