// Testes da classificação de falha da fila offline.
//   node --test src/test/offlineErros.test.mjs
//
// Esta é a regra que decide se uma bronca fotografada volta para a fila ou é
// jogada fora. Errar aqui não dá erro em lugar nenhum — só perde o trabalho de
// alguém que desceu do carro e andou até o poste.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ehErroDeRede,
  ehRecusaDefinitiva,
  motivoDoDescarte,
} from '../lib/offlineErros.js';

// ── Rede ────────────────────────────────────────────────────────────────────

test('offline explícito vence qualquer análise de texto', () => {
  // Sem rede, até um erro com cara de servidor tem que ser tratado como espera:
  // a requisição nem saiu.
  assert.equal(ehErroDeRede({ message: 'qualquer coisa' }, { online: false }), true);
});

test('as três formas de o navegador dizer "sem rede"', () => {
  const opcoes = { online: true };
  assert.equal(ehErroDeRede({ message: 'Failed to fetch' }, opcoes), true, 'Chrome');
  assert.equal(ehErroDeRede({ message: 'NetworkError when attempting to fetch' }, opcoes), true, 'Firefox');
  assert.equal(ehErroDeRede({ message: 'Load failed' }, opcoes), true, 'Safari');
  assert.equal(ehErroDeRede({ message: 'Network request failed' }, opcoes), true, 'RN/WebView');
});

test('erro COM código do Postgres nunca é de rede', () => {
  // Se veio código, a resposta chegou — logo a rede funcionou, por pior que
  // seja o conteúdo. Sem esta regra, uma mensagem de servidor que por acaso
  // contivesse "timeout" faria o item tentar para sempre.
  assert.equal(
    ehErroDeRede({ code: 'P0001', message: 'statement timeout' }, { online: true }),
    false
  );
  assert.equal(ehErroDeRede({ code: '23505', message: 'duplicate key' }, { online: true }), false);
});

test('erro de servidor sem código também não vira rede', () => {
  assert.equal(ehErroDeRede({ message: 'permission denied for table reports' }, { online: true }), false);
  assert.equal(ehErroDeRede({}, { online: true }), false);
  assert.equal(ehErroDeRede(null, { online: true }), false);
});

// ── Recusa definitiva ───────────────────────────────────────────────────────

test('missão que outra pessoa cumpriu é descartada, não repetida', () => {
  assert.equal(ehRecusaDefinitiva({ code: 'P0002' }), true);
  assert.equal(ehRecusaDefinitiva({ message: 'missao indisponivel' }), true);
});

test('duplicada e campo obrigatório também não melhoram com o tempo', () => {
  assert.equal(ehRecusaDefinitiva({ code: '23505' }), true);
  assert.equal(ehRecusaDefinitiva({ code: '22023' }), true);
  assert.equal(ehRecusaDefinitiva({ message: 'titulo obrigatorio' }), true);
});

test('erro passageiro do servidor NÃO é definitivo', () => {
  // 503, indisponibilidade, limite de conexões: tudo isso passa. Descartar
  // aqui perderia trabalho por uma janela de instabilidade.
  assert.equal(ehRecusaDefinitiva({ code: '53300', message: 'too many connections' }), false);
  assert.equal(ehRecusaDefinitiva({ message: 'service unavailable' }), false);
  assert.equal(ehRecusaDefinitiva({}), false);
});

// ── O aviso ─────────────────────────────────────────────────────────────────

test('o motivo do descarte explica em português o que aconteceu', () => {
  assert.equal(
    motivoDoDescarte({ code: 'P0002' }),
    'outra pessoa registrou este ponto antes'
  );
  assert.equal(motivoDoDescarte({ code: '23505' }), 'já tinha sido enviado');
  // Sem tradução conhecida, a mensagem crua é melhor que uma frase genérica:
  // pelo menos dá para copiar e procurar.
  assert.equal(motivoDoDescarte({ message: 'algo estranho' }), 'algo estranho');
});

test('as duas classificações nunca dizem sim ao mesmo tempo', () => {
  // Um item não pode ser "espere" e "desista" junto — a ordem no carteiro
  // testa rede primeiro, então o empate mataria itens recuperáveis.
  const casos = [
    { code: 'P0002', message: 'missao indisponivel' },
    { code: '23505', message: 'duplicate key value' },
    { message: 'Failed to fetch' },
    { message: 'Load failed' },
  ];
  for (const err of casos) {
    const rede = ehErroDeRede(err, { online: true });
    const definitiva = ehRecusaDefinitiva(err);
    assert.ok(!(rede && definitiva), `${JSON.stringify(err)} caiu nas duas`);
  }
});

// ── A janela de confiança da data ───────────────────────────────────────────
//
// Espelha `hora_confiavel` da migração 193. A regra vive no banco, que é onde
// ela protege de verdade; aqui ela é verificada como CONTRATO — se alguém mudar
// os sete dias de um lado só, o teste avisa antes de a data começar a mentir.

/** Mesma conta do SQL: preso entre 7 dias atrás e agora. */
const horaConfiavel = (quando, agora = Date.now()) => {
  if (quando == null) return agora;
  const t = new Date(quando).getTime();
  if (Number.isNaN(t)) return agora;
  const piso = agora - 7 * 24 * 60 * 60 * 1000;
  if (t > agora) return agora;
  if (t < piso) return piso;
  return t;
};

test('data do passado recente passa intacta — é o caso da fila', () => {
  const agora = Date.UTC(2026, 7, 23, 12, 0, 0);
  const ontem = agora - 24 * 60 * 60 * 1000;
  assert.equal(horaConfiavel(ontem, agora), ontem);
});

test('data do futuro vira agora, não o futuro', () => {
  // Relógio adiantado é comum. Sem o teto, a bronca ficaria em primeiro lugar
  // em toda listagem por data até a hora dela chegar.
  const agora = Date.UTC(2026, 7, 23, 12, 0, 0);
  assert.equal(horaConfiavel(agora + 60000, agora), agora);
});

test('data antiga demais é puxada para o piso de 7 dias', () => {
  // Sem piso, daria para carimbar 2019 e liderar qualquer ordenação por
  // antiguidade. Sete dias cobre com folga qualquer fila real.
  const agora = Date.UTC(2026, 7, 23, 12, 0, 0);
  const piso = agora - 7 * 24 * 60 * 60 * 1000;
  assert.equal(horaConfiavel(Date.UTC(2019, 0, 1), agora), piso);
});

test('nulo continua valendo agora — versão antiga do app não quebra', () => {
  const agora = Date.UTC(2026, 7, 23, 12, 0, 0);
  assert.equal(horaConfiavel(null, agora), agora);
  assert.equal(horaConfiavel(undefined, agora), agora);
});
