// Exploração avançada — fase 5.
//   node --test src/test/exploracaoAvancada.test.mjs
//
// Esta é a fase com mais chance de causar dano, e os testes são quase todos de
// contenção. Quatro deles são os que eu olharia primeiro numa revisão:
//
//   • coleção não é território — descobrir não é exclusivo e não há "primeiro";
//   • sensoriamento não roda sem consentimento, fora da patrulha, nem liberado;
//   • candidato NUNCA vira bronca sozinho;
//   • sugestão de categoria fica calada onde não foi medida.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RAIO_DE_DESCOBERTA_M,
  TIPOS_DE_PONTO,
  colecaoDe,
  fraseDaDescoberta,
  podeDescobrir,
  proximosDaColecao,
} from '../lib/colecao.js';

import {
  CASAS_DECIMAIS,
  JANELA_ENTRE_EVENTOS_MS,
  LIMIAR_DE_SOLAVANCO,
  RETENCAO_DIAS,
  SENSORIAMENTO_LIBERADO,
  TERMOS_DO_CONSENTIMENTO,
  arredondar,
  candidatoDe,
  candidatosPendentes,
  dentroDaRetencao,
  deveRegistrar,
  envioDaConfirmacao,
} from '../lib/sensoriamento.js';

import {
  ACERTO_MINIMO,
  AMOSTRA_MINIMA,
  acertoDe,
  assistencia,
  habilitadaPara,
  medicaoDaSugestao,
  painelDeAvaliacao,
  sugerirCategoria,
} from '../lib/iaAssistiva.js';

// ── Coleção ──────────────────────────────────────────────────────────────────

const CENTRO = { lat: -8.6, lng: -35.42 };
const aLeste = (m) => ({ lat: CENTRO.lat, lng: CENTRO.lng + m / 111320 });
const DIA = new Date('2026-10-10T13:00:00');

const ponto = (extra = {}) => ({
  id: 'p1',
  nome: 'Praça da Bandeira',
  tipo: 'ponto_turistico',
  ...aLeste(10),
  ...extra,
});

test('estar no lugar registra a visita', () => {
  assert.equal(podeDescobrir({ ponto: ponto(), posicao: CENTRO, agora: DIA }).ok, true);
});

test('de longe não registra', () => {
  const r = podeDescobrir({
    ponto: ponto({ ...aLeste(RAIO_DE_DESCOBERTA_M + 50) }),
    posicao: CENTRO,
    agora: DIA,
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'longe');
});

test('a coleção não cria motivo para sair à noite', () => {
  const r = podeDescobrir({
    ponto: ponto(),
    posicao: CENTRO,
    agora: new Date('2026-10-10T21:00:00'),
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'noite');
});

test('toda recusa explica', () => {
  for (const caso of [
    { ponto: ponto(), posicao: null, agora: DIA },
    { ponto: ponto(), posicao: CENTRO, agora: new Date('2026-10-10T03:00:00') },
  ]) {
    assert.ok(podeDescobrir(caso).texto?.length > 0);
  }
});

test('a coleção não expõe quem descobriu primeiro', () => {
  // É a linha entre coleção e território: um "primeiro a descobrir" transforma
  // o ponto em algo que pertence a alguém (princípio 6).
  const c = colecaoDe(
    [ponto({ id: 'p1', descoberto_por: 'u-outro', primeiro_em: '2026-01-01' })],
    []
  );
  const item = c.itens[0];

  assert.ok(!('descobertoPor' in item));
  assert.ok(!('primeiro' in item));
});

test('a mesma pessoa vê o que já conheceu, e o resto continua disponível', () => {
  const c = colecaoDe(
    [ponto({ id: 'p1' }), ponto({ id: 'p2' })],
    [{ ponto_id: 'p1' }]
  );

  assert.equal(c.descobertos, 1);
  assert.equal(c.total, 2);
  assert.equal(c.itens.find((i) => i.id === 'p2').descoberto, false);
});

test('o vocabulário é de conhecer, não de conquistar', () => {
  const f = fraseDaDescoberta({ nome: 'Praça X' });
  assert.match(f.titulo, /conheceu/i);
  assert.doesNotMatch(
    `${f.titulo} ${f.corpo}`,
    /conquist|domin|é seu|seu território|tomou/i
  );
});

test('a coleção diz que descobrir não tira de ninguém', () => {
  assert.match(fraseDaDescoberta({}).corpo, /não tira de ninguém/i);
});

test('todo tipo de ponto reaproveita cadastro que já existe', () => {
  // Catálogo próprio significaria recadastrar a cidade para alimentar um jogo.
  for (const t of TIPOS_DE_PONTO) {
    assert.ok(t.fonte, t.id);
  }
});

test('os próximos da coleção saem por distância', () => {
  const c = colecaoDe(
    [
      ponto({ id: 'longe', ...aLeste(500) }),
      ponto({ id: 'perto', ...aLeste(20) }),
    ],
    []
  );
  assert.equal(proximosDaColecao(c, CENTRO)[0].id, 'perto');
});

// ── Sensoriamento passivo ────────────────────────────────────────────────────

const base = {
  magnitude: LIMIAR_DE_SOLAVANCO + 2,
  posicao: CENTRO,
  consentiu: true,
  patrulhaAtiva: true,
};

test('o portão legal está fechado até haver RIPD', () => {
  // A ANPD recomenda o RIPD antes de tratamento de alto risco (§36.17). Enquanto
  // não houver, o código recusa — em vez de deixar a decisão numa configuração.
  assert.equal(SENSORIAMENTO_LIBERADO, false);
  assert.equal(deveRegistrar(base).motivo, 'nao_liberado');
});

test('sem consentimento não coleta nada', () => {
  // Testado contra a função direta para valer mesmo depois de o portão abrir.
  const r = deveRegistrar({ ...base, consentiu: false });
  assert.equal(r.ok, false);
  assert.ok(['nao_liberado', 'sem_consentimento'].includes(r.motivo));
});

test('fora da patrulha não coleta nada', () => {
  const r = deveRegistrar({ ...base, patrulhaAtiva: false });
  assert.equal(r.ok, false);
});

test('o consentimento diz o que NÃO é coletado', () => {
  // "Aceito coleta de dados" não é consentimento de nada. O que torna o
  // consentimento específico são os limites.
  const limites = TERMOS_DO_CONSENTIMENTO.limite.join(' ');

  assert.match(limites, /nunca com o app fechado/i);
  assert.match(limites, /nunca o seu trajeto/i);
  assert.match(limites, /áudio/i);
  assert.match(limites, /sem você olhar e confirmar/i);
});

test('o consentimento diz como sair e o que acontece ao sair', () => {
  const sair = TERMOS_DO_CONSENTIMENTO.comoSair.join(' ');
  assert.match(sair, /desligar/i);
  assert.match(sair, /apagados/i);
});

test('a coordenada guardada é grosseira de propósito', () => {
  assert.equal(arredondar(-8.612345678), -8.6123);
  assert.ok(CASAS_DECIMAIS <= 4, 'mais casas seria mais precisão que a necessária');
});

test('o candidato não guarda nada que reconstrua trajeto', () => {
  const c = candidatoDe({ posicao: { ...CENTRO, speed: 12, heading: 90 }, magnitude: 7.4 });

  for (const proibido of ['speed', 'heading', 'accuracy', 'patrol_id', 'trajeto']) {
    assert.ok(!(proibido in c), `candidato guarda "${proibido}"`);
  }
  assert.equal(c.intensidade, 7);
});

test('picos em sequência não viram quarenta candidatos do mesmo buraco', () => {
  const agora = Date.now();
  const r = deveRegistrar({
    ...base,
    ultimoEventoEm: agora - (JANELA_ENTRE_EVENTOS_MS - 1000),
    agora,
  });
  assert.equal(r.ok, false);
});

test('o limiar exige solavanco de verdade', () => {
  assert.ok(LIMIAR_DE_SOLAVANCO >= 5, 'baixo demais encheria a fila de ruído');
});

// ── Confirmação posterior ────────────────────────────────────────────────────

const candidato = (extra = {}) => ({
  id: 'c1',
  lat: -8.6123,
  lng: -35.42,
  ocorreu_em: new Date().toISOString(),
  ...extra,
});

test('candidato confirmado como buraco vira RASCUNHO, não bronca', () => {
  const r = envioDaConfirmacao({ respostaId: 'buraco', candidato: candidato() });

  assert.ok(r.rascunhoDeBronca);
  assert.equal(r.rascunhoDeBronca.origem, 'sensoriamento');
  // Nada aqui é um insert em `reports`: quem cadastra é a pessoa, com foto.
  assert.ok(!('id' in r.rascunhoDeBronca));
});

test('"não era nada" fecha o candidato sem criar nada', () => {
  const r = envioDaConfirmacao({ respostaId: 'nada', candidato: candidato() });
  assert.equal(r.rascunhoDeBronca, null);
  assert.equal(r.confirmacao.resposta, 'nada');
});

test('"não lembro" é resposta de primeira classe', () => {
  const r = envioDaConfirmacao({ respostaId: 'nao_lembro', candidato: candidato() });
  assert.equal(r.rascunhoDeBronca, null);
});

test('lombada não vira bronca', () => {
  assert.equal(
    envioDaConfirmacao({ respostaId: 'lombada', candidato: candidato() }).rascunhoDeBronca,
    null
  );
});

test('candidato vencido não é mostrado nem confirmado', () => {
  const velho = candidato({
    ocorreu_em: new Date(Date.now() - (RETENCAO_DIAS + 1) * 86400000).toISOString(),
  });

  assert.equal(dentroDaRetencao(velho), false);
  assert.deepEqual(candidatosPendentes([velho]), []);
});

test('candidato já confirmado sai da fila', () => {
  assert.deepEqual(
    candidatosPendentes([candidato({ confirmado_em: new Date().toISOString() })]),
    []
  );
});

// ── IA assistiva ─────────────────────────────────────────────────────────────

const perto = (categoria, n) =>
  Array.from({ length: n }, () => ({ category_id: categoria }));

test('categoria sem medição fica desligada', () => {
  // A escolha conservadora: um assistente não estreia medindo-se sozinho.
  const r = habilitadaPara('buracos', []);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'sem_avaliacao');
});

test('amostra pequena não libera, mesmo com acerto alto', () => {
  const r = habilitadaPara('buracos', [
    { categoria_id: 'buracos', sugeridas: 10, aceitas: 10 },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'amostra_pequena');
});

test('acerto baixo com amostra suficiente não libera', () => {
  const r = habilitadaPara('outros', [
    { categoria_id: 'outros', sugeridas: 100, aceitas: 40 },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'acerto_baixo');
});

test('acerto alto com amostra suficiente libera', () => {
  const r = habilitadaPara('buracos', [
    { categoria_id: 'buracos', sugeridas: AMOSTRA_MINIMA, aceitas: AMOSTRA_MINIMA },
  ]);
  assert.equal(r.ok, true);
});

test('a habilitação é por categoria, não uma chave global', () => {
  // É a entrega literal da fase: "IA assistiva AVALIADA POR CATEGORIA".
  const avaliacoes = [
    { categoria_id: 'buracos', sugeridas: 100, aceitas: 90 },
    { categoria_id: 'outros', sugeridas: 100, aceitas: 30 },
  ];

  assert.equal(habilitadaPara('buracos', avaliacoes).ok, true);
  assert.equal(habilitadaPara('outros', avaliacoes).ok, false);
});

test('a assistência fica calada onde a categoria não foi liberada', () => {
  const r = assistencia({
    broncasProximas: perto('outros', 10),
    avaliacoes: [{ categoria_id: 'outros', sugeridas: 100, aceitas: 30 }],
  });
  assert.equal(r, null);
});

test('a assistência sugere onde a categoria foi liberada, e diz de onde veio', () => {
  const r = assistencia({
    broncasProximas: perto('iluminacao', 8),
    avaliacoes: [{ categoria_id: 'iluminacao', sugeridas: 100, aceitas: 90 }],
  });

  assert.equal(r.categoriaId, 'iluminacao');
  assert.match(r.porque, /8 das 8/);
  // Nunca uma porcentagem de certeza sobre o problema.
  assert.doesNotMatch(`${r.porque} ${r.aviso}`, /\d+% de certeza|temos certeza/i);
  assert.match(r.aviso, /palpite/i);
});

test('vizinhança sem concentração não gera palpite', () => {
  const misturado = [
    ...perto('buracos', 3),
    ...perto('iluminacao', 3),
    ...perto('limpeza', 3),
  ];
  assert.equal(sugerirCategoria(misturado), null);
});

test('poucas broncas por perto não geram palpite', () => {
  assert.equal(sugerirCategoria(perto('buracos', 2)), null);
});

test('a medição compara o sugerido com o escolhido, sem "quase certo"', () => {
  assert.equal(medicaoDaSugestao({ sugerida: 'buracos', escolhida: 'buracos' }).aceita, true);
  assert.equal(medicaoDaSugestao({ sugerida: 'buracos', escolhida: 'esgoto' }).aceita, false);
});

test('o painel mostra as categorias sem medição, e não as esconde', () => {
  // "Não sabemos" é a informação mais acionável do painel.
  const p = painelDeAvaliacao([{ categoria_id: 'buracos', sugeridas: 100, aceitas: 90 }]);

  assert.ok(p.length > 1);
  assert.equal(p.find((x) => x.categoriaId === 'buracos').ok, true);
  assert.match(p.find((x) => x.categoriaId === 'esgoto').rotulo, /sem medição/);
});

test('o corte de acerto não é frouxo nem impossível', () => {
  assert.ok(ACERTO_MINIMO >= 0.6 && ACERTO_MINIMO <= 0.9);
  assert.equal(acertoDe({ sugeridas: 0, aceitas: 0 }), null);
});

// ── O impasse de bootstrap, e o modo sombra ──────────────────────────────────
//
// A habilitação exige 30 medições com 70% de acerto. Se a medição só existisse
// quando a sugestão APARECE, nenhuma categoria jamais sairia de zero: sem
// sugestão não há medição, sem medição não há habilitação, sem habilitação não
// há sugestão.
//
// A saída é a §36.5: rodar em modo sombra — calcular e medir sempre, exibir só
// quando os dados autorizarem. Estes dois testes guardam as duas metades.

test('o palpite bruto existe mesmo com a categoria calada', () => {
  // É ele que a tela mede em silêncio. Se `sugerirCategoria` passar a depender
  // da avaliação, o impasse volta.
  const bruta = sugerirCategoria(perto('esgoto', 6));

  assert.equal(bruta.categoriaId, 'esgoto');
  assert.equal(assistencia({ broncasProximas: perto('esgoto', 6), avaliacoes: [] }), null);
});

test('medir não depende de a sugestão ter sido exibida', () => {
  // `medicaoDaSugestao` recebe o palpite bruto, não o que passou pelo portão.
  const m = medicaoDaSugestao({ sugerida: 'esgoto', escolhida: 'esgoto' });
  assert.equal(m.aceita, true);
});
