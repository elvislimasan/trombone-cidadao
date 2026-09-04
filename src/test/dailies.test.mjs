// Missões diárias: sorteio determinístico, cota por tipo e a guarda.
//   node --test src/test/dailies.test.mjs
//
// O teste central é o do determinismo. Ele é o que permite NÃO existir tabela
// de diárias: se a mesma entrada deixar de produzir a mesma saída, a diária
// muda no meio do dia e o progresso da pessoa aponta para um cartão que não
// está mais lá.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIARIAS,
  TIPOS,
  PONTOS_DIARIA,
  PONTOS_DIA_PERFEITO,
  tipoDaDiaria,
  sortearDiarias,
  diariasDeHoje,
  resumoDoDia,
  restaDoDia,
} from '../lib/dailies.js';

const USER = 'abc-123';
const DIA = new Date(2026, 7, 26, 10, 0, 0); // 26/08/2026, hora local

// ── Determinismo ──────────────────────────────────────────────────────────────

test('mesma pessoa, mesmo dia, mesmas diárias', () => {
  const a = sortearDiarias(USER, DIA).map((d) => d.id);
  const b = sortearDiarias(USER, DIA).map((d) => d.id);
  assert.deepEqual(a, b);
});

test('a hora do dia não muda o sorteio', () => {
  // Sortear às 6h e às 23h tem que dar a mesma coisa, senão a diária troca no
  // meio do dia e o progresso aponta para um cartão que sumiu.
  const manha = sortearDiarias(USER, new Date(2026, 7, 26, 6, 0)).map((d) => d.id);
  const noite = sortearDiarias(USER, new Date(2026, 7, 26, 23, 30)).map((d) => d.id);
  assert.deepEqual(manha, noite);
});

test('pessoas diferentes recebem sorteios independentes', () => {
  // Não é garantia de diferença (podem coincidir), mas em 5 dias seguidos duas
  // pessoas idênticas seriam sinal de a semente ignorar o usuário.
  const iguais = [0, 1, 2, 3, 4].filter((i) => {
    const dia = new Date(2026, 7, 20 + i);
    const a = sortearDiarias('user-a', dia).map((d) => d.id).join();
    const b = sortearDiarias('user-b', dia).map((d) => d.id).join();
    return a === b;
  });
  assert.ok(iguais.length < 5, 'a semente parece ignorar o usuário');
});

test('dias diferentes mudam o sorteio ao longo da semana', () => {
  const semana = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    sortearDiarias(USER, new Date(2026, 7, 20 + i)).map((d) => d.id).join()
  );
  assert.ok(new Set(semana).size > 1, 'a semente parece ignorar o dia');
});

test('sem usuário não há sorteio', () => {
  assert.deepEqual(sortearDiarias(null, DIA), []);
  assert.deepEqual(sortearDiarias('', DIA), []);
});

// ── A cota ────────────────────────────────────────────────────────────────────

test('são três, uma de cada tipo', () => {
  const d = sortearDiarias(USER, DIA);
  assert.equal(d.length, 3);
  assert.deepEqual(d.map((x) => x.tipo), TIPOS);
});

test('a cota vale em qualquer dia', () => {
  // Sem a cota, um dia poderia cair com três de comunidade — e ninguém iria à
  // rua.
  for (let i = 0; i < 30; i += 1) {
    const tipos = sortearDiarias(USER, new Date(2026, 7, 1 + i)).map((d) => d.tipo);
    assert.deepEqual(tipos, TIPOS, `dia ${i} quebrou a cota`);
  }
});

// ── A guarda ──────────────────────────────────────────────────────────────────

test('sem alvos ao alcance, o tipo campo não entra', () => {
  // Todas as diárias de campo exigem alvos. Dois cartões honestos valem mais
  // que três, um dos quais impossível.
  const d = sortearDiarias(USER, DIA, { temAlvos: false });
  assert.ok(!d.some((x) => x.tipo === 'campo'));
  assert.equal(d.length, 2);
});

test('sem alvos, registro e comunidade continuam', () => {
  const d = sortearDiarias(USER, DIA, { temAlvos: false });
  assert.deepEqual(d.map((x) => x.tipo), ['registro', 'comunidade']);
});

test('nenhuma diária de comunidade exige alvos', () => {
  // Apoiar, comentar e compartilhar sempre têm alvo enquanto houver feed.
  const comunidade = DIARIAS.filter((d) => d.tipo === 'comunidade');
  assert.ok(comunidade.length > 0);
  assert.ok(!comunidade.some((d) => d.exigeAlvos));
});

// ── O catálogo ────────────────────────────────────────────────────────────────

test('toda meta cabe num dia', () => {
  // Entre 1 e 5. Uma meta de 10 vira diária que ninguém fecha, e diária que
  // ninguém fecha deixa de ser lida no dia seguinte.
  for (const d of DIARIAS) {
    assert.ok(d.meta >= 1 && d.meta <= 5, `${d.id} pede ${d.meta}`);
  }
});

test('todo tipo tem pelo menos uma diária', () => {
  for (const t of TIPOS) {
    assert.ok(DIARIAS.some((d) => d.tipo === t), `nenhuma diária do tipo ${t}`);
  }
});

test('ids são únicos', () => {
  const ids = DIARIAS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('todo id do catálogo resolve para seu tipo', () => {
  for (const d of DIARIAS) assert.equal(tipoDaDiaria(d.id), d.tipo);
  assert.equal(tipoDaDiaria('id-inventado'), null);
});

test('toda diária leva a algum lugar do app', () => {
  for (const d of DIARIAS) {
    assert.ok(d.acao?.para?.startsWith('/'), `${d.id} não tem destino`);
  }
});

test('o dia perfeito vale mais que a soma de uma diária', () => {
  assert.ok(PONTOS_DIA_PERFEITO > PONTOS_DIARIA);
});

// ── Progresso ─────────────────────────────────────────────────────────────────

test('sem contadores, tudo começa em zero', () => {
  const d = diariasDeHoje(USER, {}, [], DIA);
  assert.ok(d.every((x) => x.atual === 0 && !x.completa));
});

test('o progresso não passa da meta', () => {
  // "8 / 3" na tela seria um erro visível.
  const d = diariasDeHoje(USER, { upvotes_given: 99, comments_count: 99, shares_count: 99 }, [], DIA);
  const comunidade = d.find((x) => x.tipo === 'comunidade');
  assert.equal(comunidade.atual, comunidade.meta);
  assert.equal(comunidade.progresso, 1);
});

test('a linha gravada vence a contagem do dia', () => {
  // Uma diária concluída às 10h continua concluída às 23h, mesmo que o contador
  // do dia seja recalculado.
  const d = sortearDiarias(USER, DIA)[0];
  const feitas = diariasDeHoje(USER, {}, [d.id], DIA);
  assert.equal(feitas.find((x) => x.id === d.id).completa, true);
});

test('uma conclusão anterior do mesmo tipo continua valendo', () => {
  const sorteada = sortearDiarias(USER, DIA).find((d) => d.tipo === 'comunidade');
  const alternativa = DIARIAS.find(
    (d) => d.tipo === 'comunidade' && d.id !== sorteada.id
  );
  const feitas = diariasDeHoje(USER, {}, [alternativa.id], DIA);
  const comunidade = feitas.find((d) => d.tipo === 'comunidade');
  assert.equal(comunidade.completa, true);
  assert.equal(comunidade.gravada, true);
});

test('resumo conta as fechadas e reconhece o dia perfeito', () => {
  const todas = sortearDiarias(USER, DIA).map((d) => d.id);
  const r = resumoDoDia(diariasDeHoje(USER, {}, todas, DIA));
  assert.equal(r.concluidas, 3);
  assert.equal(r.perfeito, true);
  assert.equal(r.rotulo, '3/3');
});

test('dia sem nenhuma fechada não é perfeito', () => {
  const r = resumoDoDia(diariasDeHoje(USER, {}, [], DIA));
  assert.equal(r.perfeito, false);
});

test('lista vazia não vira dia perfeito', () => {
  // Zero de zero é 100%, e seria um dia perfeito de graça.
  assert.equal(resumoDoDia([]).perfeito, false);
  assert.equal(resumoDoDia(null).perfeito, false);
});

// ── O relógio ─────────────────────────────────────────────────────────────────

test('o relógio conta até a meia-noite local', () => {
  const r = restaDoDia(new Date(2026, 7, 26, 22, 0, 0));
  assert.equal(r.horas, 2);
  assert.match(r.rotulo, /2h/);
});

test('na última hora o rótulo vira minutos', () => {
  const r = restaDoDia(new Date(2026, 7, 26, 23, 40, 0));
  assert.equal(r.horas, 0);
  assert.match(r.rotulo, /min/);
});

// ── Disponibilidade real, por tipo de alvo (fase 2) ───────────────────────────
//
// A guarda existia desde a 200 e nunca recebeu um valor. Ligá-la trouxe uma
// distinção que o booleano único escondia: cidade cheia de bronca e sem nenhum
// sinal é o caso comum, não a exceção.

test('sem sinal pendente, a diária de conferir marcados não é sorteada', () => {
  for (let i = 0; i < 40; i += 1) {
    const d = sortearDiarias(`u-${i}`, DIA, { temSinais: false });
    assert.ok(!d.some((x) => x.id === 'conferir_marcados'), `usuário ${i}`);
  }
});

test('sem bronca aberta, a diária de confirmar campo não é sorteada', () => {
  for (let i = 0; i < 40; i += 1) {
    const d = sortearDiarias(`u-${i}`, DIA, { temBroncas: false });
    assert.ok(!d.some((x) => x.id === 'confirmar_campo'), `usuário ${i}`);
  }
});

test('só bronca disponível ainda dá uma diária de campo', () => {
  const d = sortearDiarias(USER, DIA, { temSinais: false });
  assert.ok(d.some((x) => x.tipo === 'campo'));
});

test('a diária de campo aponta para a rota, não para a patrulha livre', () => {
  // Mandar para /patrulhar devolve a pessoa exatamente à decisão que ela não
  // sabia tomar — que é o problema que a fase 2 existe para resolver.
  const campo = DIARIAS.find((d) => d.id === 'confirmar_campo');
  assert.equal(campo.acao.para, '/rota-do-dia');
});

test('as diárias de comunidade nunca dependem de alvo', () => {
  for (const d of DIARIAS.filter((x) => x.tipo === 'comunidade')) {
    assert.equal(d.exige, undefined, d.id);
  }
});
