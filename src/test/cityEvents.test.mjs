// Trombone Agora: catálogo, previsão, áreas, linha do tempo e a enquete.
//   node --test src/test/cityEvents.test.mjs
//
// O teste mais importante deste arquivo é o do mapa de preferências. Ele copia
// à mão o CASE de `city_event_audience` (migração 206) e compara. Se alguém
// mudar um lado só, o resultado não é uma tela feia: é um interruptor que diz
// "desliguei falta d'água" enquanto o banco continua mandando — ou pior, um
// alerta climático silenciado por quem desligou "eventos".

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIPOS,
  FILTROS,
  PREFERENCIAS,
  PREFERENCIAS_PADRAO,
  MINIMO_PARA_DIVERGIR,
  PRECISAO_PREVISAO,
  instanteDaPrevisao,
  precisaoDoEvento,
  tipoDe,
  preferenciaDoTipo,
  tiposDaPreferencia,
  tiposDoFiltro,
  statusDe,
  estaAberto,
  horaCurta,
  previsaoLegivel,
  tempoDesde,
  estadoDaPrevisao,
  fimDoDiaLocal,
  rotuloDasAreas,
  nomesDasAreas,
  legendaDoAndamento,
  linhaDoTempo,
  progressoDaPrevisao,
  resumoDasConfirmacoes,
  veredictoDaComunidade,
  podeConfirmar,
  situacaoDaRua,
} from '../lib/cityEvents.js';

// ── O catálogo bate com o banco ──────────────────────────────────────────────

// Cópia literal do CASE de `city_event_audience` na migração 206.
const CASE_DA_206 = {
  water_outage: 'water_alerts',
  power_outage: 'power_alerts',
  road_block: 'traffic_alerts',
  traffic: 'traffic_alerts',
  public_transport: 'traffic_alerts',
  construction: 'works_alerts',
  event: 'events_alerts',
  public_notice: 'public_notice_alerts',
  // o `else` do CASE
  weather: 'critical_alerts',
  health: 'critical_alerts',
  other: 'critical_alerts',
};

test('cada tipo usa a mesma preferência que a migração 206 consulta', () => {
  for (const tipo of TIPOS) {
    assert.equal(
      preferenciaDoTipo(tipo.id),
      CASE_DA_206[tipo.id],
      `${tipo.id} divergiu entre o catálogo e o CASE da 206`
    );
  }
});

test('os onze tipos do plano existem, e nenhum a mais', () => {
  assert.equal(TIPOS.length, 11);
  assert.equal(new Set(TIPOS.map((t) => t.id)).size, 11);
});

test('toda preferência do painel silencia pelo menos um tipo', () => {
  for (const pref of PREFERENCIAS) {
    assert.ok(
      tiposDaPreferencia(pref.chave).length > 0,
      `${pref.chave} não silencia nada — é um interruptor que não faz nada`
    );
  }
});

test('todo tipo cai em alguma preferência do painel', () => {
  const doPainel = new Set(PREFERENCIAS.map((p) => p.chave));
  for (const tipo of TIPOS) {
    assert.ok(doPainel.has(tipo.pref), `${tipo.id} usa uma chave que a tela não mostra`);
  }
});

test('o padrão de quem acompanha é tudo ligado', () => {
  assert.ok(Object.values(PREFERENCIAS_PADRAO).every(Boolean));
  assert.equal(Object.keys(PREFERENCIAS_PADRAO).length, PREFERENCIAS.length);
});

test('tipo desconhecido não derruba a tela', () => {
  const t = tipoDe('coisa_que_nao_existe');
  assert.ok(t.rotulo);
  assert.ok(t.emoji);
  assert.equal(preferenciaDoTipo(undefined), 'critical_alerts');
});

// ── Filtros ──────────────────────────────────────────────────────────────────

test('"Todos" não filtra: devolve null, não a lista dos onze', () => {
  // A diferença importa na consulta: null vira "sem cláusula", e uma lista com
  // os onze vira um `in (...)` que exclui qualquer tipo novo do banco.
  assert.equal(tiposDoFiltro('todos'), null);
  assert.equal(tiposDoFiltro(null), null);
});

test('os filtros do topo cobrem todos os tipos, sem sobra', () => {
  const cobertos = FILTROS
    .filter((f) => f.id !== 'todos')
    .flatMap((f) => tiposDoFiltro(f.id));
  assert.equal(new Set(cobertos).size, TIPOS.length);
});

// ── Estados ──────────────────────────────────────────────────────────────────

test('só active, scheduled e awaiting_confirmation contam como abertos', () => {
  assert.ok(estaAberto({ status: 'active' }));
  assert.ok(estaAberto({ status: 'scheduled' }));
  assert.ok(estaAberto({ status: 'awaiting_confirmation' }));
  assert.ok(!estaAberto({ status: 'resolved' }));
  assert.ok(!estaAberto({ status: 'cancelled' }));
  assert.ok(!estaAberto({ status: 'draft' }));
});

test('status desconhecido não quebra o rótulo', () => {
  assert.ok(statusDe('inventado').rotulo);
});

// ── Datas ────────────────────────────────────────────────────────────────────

const EM = (h, m = 0, dia = 30) => new Date(2026, 7, dia, h, m, 0);

test('a hora sai com dois dígitos', () => {
  assert.equal(horaCurta(EM(9, 5)), '09:05');
  assert.equal(horaCurta(EM(14, 20)), '14:20');
  assert.equal(horaCurta(null), '');
});

test('previsão de hoje é "Hoje", com hora redonda sem os minutos', () => {
  assert.equal(previsaoLegivel(EM(18, 0), EM(14, 20)), 'Hoje, 18h');
  assert.equal(previsaoLegivel(EM(18, 30), EM(14, 20)), 'Hoje, 18:30');
});

test('amanhã e ontem têm nome; o resto vira data', () => {
  assert.equal(previsaoLegivel(EM(8, 0, 31), EM(14, 20, 30)), 'Amanhã, 8h');
  assert.equal(previsaoLegivel(EM(22, 0, 29), EM(14, 20, 30)), 'Ontem, 22h');
  assert.equal(previsaoLegivel(EM(18, 0, 25), EM(14, 20, 30)), '25/08 às 18h');
});

test('"amanhã" é dia de calendário, não 24 horas', () => {
  // 23h de hoje para 1h da manhã é "amanhã", mesmo faltando duas horas. Quem lê
  // "Hoje, 1h" às 23h entende que já passou.
  assert.equal(previsaoLegivel(EM(1, 0, 31), EM(23, 0, 30)), 'Amanhã, 1h');
});

test('tempo desde: minutos, horas e dias', () => {
  assert.equal(tempoDesde(EM(14, 0), EM(14, 32)), 'há 32 min');
  assert.equal(tempoDesde(EM(12, 0), EM(14, 0)), 'há 2h');
  assert.equal(tempoDesde(EM(12, 0, 27), EM(12, 0, 30)), 'há 3 dias');
  assert.equal(tempoDesde(EM(14, 0), EM(14, 0)), 'agora');
});

// ── Previsão vencida ─────────────────────────────────────────────────────────

test('previsão vencida só vale para acontecimento aberto', () => {
  const previsto = EM(18, 0);
  const depois = EM(22, 0);

  assert.ok(estadoDaPrevisao({ status: 'active', estimated_end_at: previsto }, depois).vencida);
  // Um resolvido cuja previsão já passou é o caso NORMAL: previsão de 18h,
  // resolvido às 17h, aberto de novo às 22h. Marcar como vencida faria a tela
  // pedir verificação de algo que já fechou.
  assert.ok(!estadoDaPrevisao({ status: 'resolved', estimated_end_at: previsto }, depois).vencida);
});

test('sem previsão, não há vencimento nem texto de hora', () => {
  const e = estadoDaPrevisao({ status: 'active', estimated_end_at: null }, EM(22, 0));
  assert.equal(e.tem, false);
  assert.equal(e.vencida, false);
  assert.equal(e.texto, 'Sem previsão');
});

// ── Áreas ────────────────────────────────────────────────────────────────────

const bairro = (label) => ({ area_type: 'neighborhood', area_id: label, label });
const rua = (label) => ({ area_type: 'street', area_id: label, label });

test('um bairro só aparece sozinho', () => {
  assert.equal(rotuloDasAreas([bairro('Morada Nobre')]), 'Morada Nobre');
});

test('o cartão mostra um nome e conta o resto', () => {
  const areas = [bairro('Morada Nobre'), bairro('Centro'), bairro('Boa Vista')];
  assert.equal(rotuloDasAreas(areas), 'Morada Nobre e mais 2 bairros');
});

test('a tela de detalhe mostra três e conta o resto', () => {
  const areas = [
    bairro('Morada Nobre'), bairro('Morada do Sol'), bairro('Parque das Acácias'),
    bairro('Centro'), bairro('Boa Vista'),
  ];
  assert.equal(
    rotuloDasAreas(areas, { maximo: 3 }),
    'Morada Nobre, Morada do Sol e Parque das Acácias e mais 2 bairros'
  );
});

test('o plural do resto é do que sobrou, não do primeiro', () => {
  // Um bairro mostrado e duas ruas restantes tem que dizer "ruas".
  const areas = [bairro('Centro'), rua('Rua A'), rua('Rua B')];
  assert.equal(rotuloDasAreas(areas), 'Centro e mais 2 ruas');
});

test('singular quando sobra um só', () => {
  assert.equal(rotuloDasAreas([bairro('Centro'), rua('Rua A')]), 'Centro e mais 1 rua');
});

test('evento de cidade inteira não lista bairro nenhum', () => {
  const areas = [{ area_type: 'city', area_id: null, label: 'Floresta' }, bairro('Centro')];
  assert.equal(rotuloDasAreas(areas), 'Toda a cidade · Floresta');
});

test('lista vazia ou suja não vira texto', () => {
  assert.equal(rotuloDasAreas([]), '');
  assert.equal(rotuloDasAreas(null), '');
  assert.equal(rotuloDasAreas([{ area_type: 'street' }]), '');
  assert.deepEqual(nomesDasAreas([bairro('Centro'), null]), ['Centro']);
});

// ── Linha do tempo ───────────────────────────────────────────────────────────

const EVENTO_BASE = {
  status: 'active',
  estimated_end_at: EM(18, 0),
  updates: [
    { id: 1, type: 'created', message: 'Abastecimento interrompido', created_at: EM(14, 20) },
    { id: 2, type: 'progress', message: 'Equipe trabalhando no reparo', created_at: EM(15, 42) },
  ],
};

test('a linha do tempo sai em ordem cronológica', () => {
  const foraDeOrdem = { ...EVENTO_BASE, updates: [...EVENTO_BASE.updates].reverse() };
  const horas = linhaDoTempo(foraDeOrdem, EM(16, 0)).map((i) => i.hora);
  assert.deepEqual(horas.slice(0, 2), ['14:20', '15:42']);
});

test('acontecimento aberto termina em "Aguardando confirmação"', () => {
  const itens = linhaDoTempo(EVENTO_BASE, EM(16, 0));
  const ultimo = itens[itens.length - 1];
  assert.equal(ultimo.pendente, true);
  assert.equal(ultimo.titulo, 'Aguardando confirmação');
  assert.equal(ultimo.hora, '—');
});

test('a parada pendente muda de texto quando a previsão vence', () => {
  assert.equal(linhaDoTempo(EVENTO_BASE, EM(16, 0)).at(-1).detalhe, 'Verificação após previsão');
  assert.equal(linhaDoTempo(EVENTO_BASE, EM(22, 0)).at(-1).detalhe, 'A previsão terminou');
});

test('acontecimento fechado não tem parada pendente', () => {
  const resolvido = { ...EVENTO_BASE, status: 'resolved' };
  assert.ok(linhaDoTempo(resolvido, EM(22, 0)).every((i) => !i.pendente));
});

test('prorrogação mostra a previsão nova, não o texto livre', () => {
  const comProrrogacao = {
    ...EVENTO_BASE,
    updates: [
      ...EVENTO_BASE.updates,
      {
        id: 3, type: 'extended', message: 'O reparo exigiu intervenção adicional',
        old_estimated_end_at: EM(18, 0), new_estimated_end_at: EM(20, 0), created_at: EM(17, 55),
      },
    ],
  };
  const item = linhaDoTempo(comProrrogacao, EM(18, 0)).find((i) => i.id === 'u3');
  assert.equal(item.titulo, 'Previsão de normalização');
  assert.equal(item.detalhe, 'Atualizada para Hoje, 20h');
});

test('sem atualizações, a linha do tempo ainda promete o passo que falta', () => {
  const itens = linhaDoTempo({ status: 'active', updates: [] }, EM(16, 0));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].pendente, true);
});

// ── Confirmação da comunidade ────────────────────────────────────────────────

test('a enquete só abre depois do anúncio de resolução', () => {
  assert.ok(podeConfirmar({ status: 'resolved' }));
  assert.ok(!podeConfirmar({ status: 'active' }));
  assert.ok(!podeConfirmar({ status: 'awaiting_confirmation' }));
});

test('placar do exemplo do plano: 83 sim, 4 não', () => {
  const r = resumoDasConfirmacoes({ resolved: 83, not_resolved: 4 });
  assert.equal(r.total, 87);
  assert.equal(r.pctSim, 95);
  assert.equal(r.confirmado, true);
  assert.equal(r.divergente, false);
});

test('divergência do plano: 38 sim, 47 não', () => {
  const r = resumoDasConfirmacoes({ resolved: 38, not_resolved: 47 });
  assert.equal(r.divergente, true);
  assert.equal(r.pctNao, 55);
});

test('abaixo do piso, maioria não vira divergência', () => {
  // Duas respostas discordantes não podem reabrir um alerta da cidade inteira.
  const r = resumoDasConfirmacoes({ resolved: 1, not_resolved: 2 });
  assert.equal(r.total, 3);
  assert.ok(r.total < MINIMO_PARA_DIVERGIR);
  assert.equal(r.divergente, false);
  assert.equal(r.confirmado, false);
  // Mas o placar continua visível para quem respondeu.
  assert.equal(veredictoDaComunidade(r).texto, '3 respostas até agora.');
});

test('empate não é divergência nem confirmação', () => {
  const r = resumoDasConfirmacoes({ resolved: 10, not_resolved: 10 });
  assert.equal(r.divergente, false);
  assert.equal(r.confirmado, false);
});

test('sem resposta nenhuma não há veredicto', () => {
  assert.equal(veredictoDaComunidade(resumoDasConfirmacoes(null)), null);
});

test('contagem suja não vira porcentagem negativa', () => {
  const r = resumoDasConfirmacoes({ resolved: -5, not_resolved: 'dez' });
  assert.equal(r.total, 0);
  assert.equal(r.pctSim, 0);
});

// ── Minha Rua ────────────────────────────────────────────────────────────────

test('rua sem acontecimento aberto está normal', () => {
  assert.equal(situacaoDaRua([]).normal, true);
  assert.equal(situacaoDaRua([{ status: 'resolved', severity: 'critical' }]).normal, true);
});

test('entre dois acontecimentos, o mais grave é o que aparece', () => {
  const feira = { status: 'active', type: 'event', severity: 'info', started_at: EM(16, 0) };
  const agua = { status: 'active', type: 'water_outage', severity: 'critical', started_at: EM(9, 0) };

  const s = situacaoDaRua([feira, agua], EM(17, 0));
  assert.equal(s.evento, agua);
  assert.equal(s.texto, "Falta d'água na sua região");
  assert.equal(s.outros, 1);
});

test('mesma gravidade: o mais recente ganha', () => {
  const antigo = { status: 'active', type: 'traffic', severity: 'warning', started_at: EM(9, 0) };
  const novo = { status: 'active', type: 'road_block', severity: 'warning', started_at: EM(16, 0) };
  assert.equal(situacaoDaRua([antigo, novo], EM(17, 0)).evento, novo);
});

test('a situação da rua carrega a previsão pronta', () => {
  const evento = {
    status: 'active', type: 'water_outage', severity: 'warning',
    started_at: EM(14, 20), estimated_end_at: EM(18, 0),
  };
  assert.equal(situacaoDaRua([evento], EM(15, 0)).previsao.texto, 'Hoje, 18h');
});

// ── Hora falada, progresso e legenda ─────────────────────────────────────────

test('meia-noite e meio-dia têm nome — "0h" não é português', () => {
  // Era o que o print do dia 30/08 mostrava: "Amanhã, 0h", que parece campo
  // não preenchido.
  assert.equal(previsaoLegivel(EM(0, 0, 31), EM(18, 28, 30)), 'Amanhã, meia-noite');
  assert.equal(previsaoLegivel(EM(12, 0), EM(9, 0)), 'Hoje, meio-dia');
  // Com minutos, volta a ser relógio.
  assert.equal(previsaoLegivel(EM(0, 30, 31), EM(18, 0, 30)), 'Amanhã, 00:30');
  assert.equal(previsaoLegivel(EM(12, 15), EM(9, 0)), 'Hoje, 12:15');
});

test('o progresso é a fração da janela prevista', () => {
  const e = { started_at: EM(14, 0), estimated_end_at: EM(18, 0) };
  assert.equal(progressoDaPrevisao(e, EM(14, 0)), 0);
  assert.equal(progressoDaPrevisao(e, EM(16, 0)), 0.5);
  assert.equal(progressoDaPrevisao(e, EM(18, 0)), 1);
});

test('passa de 1 quando vence — quem desenha é que corta', () => {
  const e = { started_at: EM(14, 0), estimated_end_at: EM(18, 0) };
  assert.ok(progressoDaPrevisao(e, EM(22, 0)) > 1);
});

test('sem janela não há barra', () => {
  assert.equal(progressoDaPrevisao({ started_at: EM(14, 0) }, EM(16, 0)), null);
  assert.equal(progressoDaPrevisao({ estimated_end_at: EM(18, 0) }, EM(16, 0)), null);
  // Previsão antes do início: janela negativa, proporção sem sentido.
  assert.equal(progressoDaPrevisao({ started_at: EM(18, 0), estimated_end_at: EM(14, 0) }), null);
});

test('nunca negativo — relógio adiantado não desenha barra ao contrário', () => {
  const e = { started_at: EM(14, 0), estimated_end_at: EM(18, 0) };
  assert.equal(progressoDaPrevisao(e, EM(9, 0)), 0);
});

test('a legenda diz "Atualizado" só quando houve atualização', () => {
  const semUpdate = { started_at: EM(14, 20), updates: [{ id: 1, type: 'created', created_at: EM(14, 20) }] };
  assert.deepEqual(legendaDoAndamento(semUpdate), { rotulo: 'Iniciado', hora: '14:20' });

  const comUpdate = {
    started_at: EM(14, 20),
    updates: [
      { id: 1, type: 'created', created_at: EM(14, 20) },
      { id: 2, type: 'progress', created_at: EM(15, 42) },
    ],
  };
  assert.deepEqual(legendaDoAndamento(comUpdate), { rotulo: 'Atualizado', hora: '15:42' });
});

test('a legenda pega a atualização mais recente, não a última da lista', () => {
  const foraDeOrdem = {
    started_at: EM(14, 20),
    updates: [
      { id: 3, type: 'extended', created_at: EM(17, 55) },
      { id: 2, type: 'progress', created_at: EM(15, 42) },
    ],
  };
  assert.equal(legendaDoAndamento(foraDeOrdem).hora, '17:55');
});

test('evento sem nada não produz legenda', () => {
  assert.equal(legendaDoAndamento({}), null);
});

// ── Previsão só o dia ────────────────────────────────────────────────────────

test('só o dia omite a hora, e "amanhã" continua sendo amanhã', () => {
  // O caso que motivou a opção: campo de hora vazio virava 00:00 e a tela
  // escrevia "Amanhã, meia-noite" — hora que ninguém prometeu.
  const o = { soDia: true };
  assert.equal(previsaoLegivel(EM(23, 59, 31), EM(18, 0, 30), o), 'Amanhã');
  assert.equal(previsaoLegivel(EM(23, 59), EM(9, 0), o), 'Hoje');
  assert.equal(previsaoLegivel(EM(23, 59, 29), EM(9, 0, 30), o), 'Ontem');
  assert.equal(previsaoLegivel(EM(23, 59, 25), EM(9, 0, 30), o), '25/08');
});

test('a bandeira do evento chega sozinha ao texto da previsão', () => {
  const base = { status: 'active', started_at: EM(14, 0), estimated_end_at: EM(23, 59, 31) };
  assert.equal(estadoDaPrevisao(base, EM(18, 0)).texto, 'Amanhã, 23:59');
  assert.equal(
    estadoDaPrevisao({ ...base, estimated_end_day_only: true }, EM(18, 0)).texto,
    'Amanhã'
  );
});

test('só o dia grava o FIM do dia, não a meia-noite', () => {
  // Gravado às 00:00, a varredura da 206 marcaria como vencida no primeiro
  // segundo do dia e acordaria o responsável às 00:00:01.
  const iso = fimDoDiaLocal('2026-08-31');
  const d = new Date(iso);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 31);
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
});

test('data inválida não vira instante', () => {
  for (const ruim of [null, '', '31/08/2026', '2026-8-31', 'amanhã']) {
    assert.equal(fimDoDiaLocal(ruim), null);
  }
});

test('previsão só o dia ainda vence — só não mostra hora', () => {
  const e = { status: 'active', estimated_end_at: EM(23, 59, 30), estimated_end_day_only: true };
  assert.equal(estadoDaPrevisao(e, EM(20, 0, 30)).vencida, false);
  assert.equal(estadoDaPrevisao(e, EM(10, 0, 31)).vencida, true);
});

test('a prorrogação na linha do tempo respeita a precisão', () => {
  const updates = [{
    id: 3, type: 'extended', new_estimated_end_at: EM(23, 59, 31), created_at: EM(17, 55),
  }];
  const comHora = linhaDoTempo({ status: 'active', updates }, EM(18, 0)).find((i) => i.id === 'u3');
  assert.equal(comHora.detalhe, 'Atualizada para Amanhã, 23:59');

  const soDia = linhaDoTempo(
    { status: 'active', estimated_end_day_only: true, updates }, EM(18, 0)
  ).find((i) => i.id === 'u3');
  assert.equal(soDia.detalhe, 'Atualizada para Amanhã');
});

// ── As três precisões da previsão ────────────────────────────────────────────

test('"sem previsão" é uma resposta, não um campo vazio', () => {
  const r = instanteDaPrevisao({ precisao: 'nenhuma', data: '2026-09-02', hora: '18:00' });
  // Mesmo com data e hora preenchidas, "sem previsão" ganha: é a escolha.
  assert.equal(r.instante, null);
  assert.equal(r.soDia, false);
});

test('"só o dia" fecha em 23:59 do dia informado', () => {
  // É o que faz a barra de progresso ir até o fim do dia, e não até 00:00.
  const r = instanteDaPrevisao({ precisao: 'dia', data: '2026-09-02' });
  const d = new Date(r.instante);
  assert.equal(d.getDate(), 2);
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
  assert.equal(r.soDia, true);
});

test('"data e hora" grava o instante escolhido', () => {
  const r = instanteDaPrevisao({ precisao: 'hora', data: '2026-09-02', hora: '18:00' });
  const d = new Date(r.instante);
  assert.equal(d.getHours(), 18);
  assert.equal(r.soDia, false);
});

test('data vazia vira "sem previsão", qualquer que seja a precisão', () => {
  for (const precisao of ['hora', 'dia']) {
    assert.deepEqual(instanteDaPrevisao({ precisao, data: '' }), { instante: null, soDia: false });
  }
  assert.deepEqual(instanteDaPrevisao({}), { instante: null, soDia: false });
});

test('a precisão de um evento gravado volta certa para o formulário', () => {
  assert.equal(precisaoDoEvento(null), 'nenhuma');
  assert.equal(precisaoDoEvento({ estimated_end_at: null }), 'nenhuma');
  assert.equal(precisaoDoEvento({ estimated_end_at: EM(18, 0) }), 'hora');
  assert.equal(precisaoDoEvento({ estimated_end_at: EM(23, 59), estimated_end_day_only: true }), 'dia');
});

test('as três precisões existem e nenhuma a mais', () => {
  assert.deepEqual(PRECISAO_PREVISAO.map((p) => p.id), ['hora', 'dia', 'nenhuma']);
});

test('a barra de progresso vale para previsão só de dia', () => {
  // Início 30/08 18:28, previsão "02/09" → janela até 02/09 23:59.
  const evento = {
    started_at: new Date(2026, 7, 30, 18, 28),
    estimated_end_at: new Date(2026, 8, 2, 23, 59),
    estimated_end_day_only: true,
  };
  const p = progressoDaPrevisao(evento, new Date(2026, 7, 30, 18, 28));
  assert.equal(p, 0);
  assert.ok(progressoDaPrevisao(evento, new Date(2026, 8, 1, 12, 0)) > 0.4);
  assert.equal(progressoDaPrevisao(evento, new Date(2026, 8, 2, 23, 59)), 1);
});

test('sem previsão não há barra — nada a medir', () => {
  const evento = { started_at: EM(14, 0), estimated_end_at: null };
  assert.equal(progressoDaPrevisao(evento, EM(20, 0)), null);
});

test('prorrogar sem data diz isso na linha do tempo', () => {
  // "Ainda não, e não sei quando" é informação; cair no rótulo genérico
  // esconderia a única coisa que a linha tem a dizer.
  const updates = [{ id: 4, type: 'extended', new_estimated_end_at: null, created_at: EM(18, 5) }];
  const item = linhaDoTempo({ status: 'active', updates }, EM(19, 0)).find((i) => i.id === 'u4');
  assert.equal(item.titulo, 'Previsão de normalização');
  assert.equal(item.detalhe, 'Sem previsão de normalização');
});
