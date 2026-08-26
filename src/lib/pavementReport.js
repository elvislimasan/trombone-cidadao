// Os relatórios do mapa de pavimentação.
//
// POR QUE ISTO SAIU DA PÁGINA
//
// A montagem do PDF vivia dentro de `PavementMapPage`, misturada com o
// `jsPDF`: decidir o que entra no relatório e desenhar caixas na folha eram a
// mesma função. Só havia dois formatos, e acrescentar um terceiro significava
// mais um `if` no meio do código de layout.
//
// Aqui a pergunta é separada da folha. Cada tipo devolve a MESMA estrutura —
// um resumo e uma lista de seções com colunas e linhas —, e quem renderiza não
// precisa saber qual foi pedido. É o que permite a mesma escolha sair em PDF ou
// em CSV sem escrever o relatório duas vezes.
//
// E É O QUE TORNA OS RELATÓRIOS TESTÁVEIS
//
// "Quantas ruas estão sem pavimentação" é uma conta, e conta errada num
// relatório que vai para a prefeitura é pior do que relatório nenhum: ninguém
// confere, porque o número parece oficial. Com a montagem pura, cada tipo tem
// teste.

/* --- Vocabulário --- */

export const STATUS_DE_RUA = Object.freeze([
  Object.freeze({ id: 'paved', label: 'Pavimentada', plural: 'Pavimentadas' }),
  Object.freeze({ id: 'partially_paved', label: 'Parcialmente pavimentada', plural: 'Parcialmente pavimentadas' }),
  Object.freeze({ id: 'unpaved', label: 'Sem pavimentação', plural: 'Sem pavimentação' }),
]);

const TIPO_DE_PAVIMENTO = Object.freeze({
  asphalt: 'Asfalto',
  paving_stone: 'Paralelepípedo',
  concrete: 'Concreto',
  interlocking: 'Intertravado',
  dirt: 'Terra',
});

export const rotuloDoStatus = (id) =>
  STATUS_DE_RUA.find((s) => s.id === id)?.label || 'Sem informação';

export const rotuloDoPavimento = (id) => TIPO_DE_PAVIMENTO[id] || 'Não informado';

/**
 * Os CEPs de uma rua, sempre como lista.
 *
 * UMA RUA PODE TER MAIS DE UM CEP
 *
 * Rua comprida atravessa bairro, e cada trecho tem o seu. O modelo antigo era
 * uma coluna de texto só, então a segunda faixa não tinha onde ser guardada.
 * `ceps` é a lista nova, com o bairro de cada faixa; `cep` é o campo antigo.
 *
 * Ler os dois aqui é o que permite a migração acontecer sem um instante em que
 * a tela fique sem CEP nenhum: enquanto a coluna nova não existir, o valor
 * antigo responde.
 */
export const cepsDaRua = (rua) => {
  if (Array.isArray(rua?.ceps) && rua.ceps.length) {
    return rua.ceps
      .map((item) => ({
        cep: String(item?.cep || '').trim(),
        bairroId: item?.bairro_id ?? null,
      }))
      .filter((item) => item.cep);
  }

  const antigo = String(rua?.cep || '').trim();
  return antigo ? [{ cep: antigo, bairroId: rua?.bairro_id ?? null }] : [];
};

const nomeDoBairro = (rua) => rua?.bairro?.name || rua?.bairro_name || 'Sem bairro';

/* --- Ordenação --- */
// Por bairro e depois por nome: é como quem confere lê, andando um bairro por
// vez. Ordenar só por nome espalharia o mesmo bairro por toda a folha.
const porBairroENome = (a, b) =>
  nomeDoBairro(a).localeCompare(nomeDoBairro(b), 'pt-BR') ||
  String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');

/* --- Contagens --- */

export const contarPorStatus = (ruas) => {
  const total = { total: ruas.length, semNome: 0, semCep: 0 };
  for (const s of STATUS_DE_RUA) total[s.id] = 0;

  for (const rua of ruas) {
    if (Object.prototype.hasOwnProperty.call(total, rua?.status)) total[rua.status] += 1;
    if (rua?.is_unnamed) total.semNome += 1;
    if (cepsDaRua(rua).length === 0) total.semCep += 1;
  }

  return total;
};

const porcentagem = (parte, todo) => (todo ? `${((parte / todo) * 100).toFixed(1)}%` : '0,0%');

/* --- Os tipos --- */
//
// Cada um responde UMA pergunta. A lista existe para a tela oferecer as
// perguntas em vez de oferecer opções de formatação: quem baixa o relatório
// quer saber quantas ruas faltam, não escolher colunas.

const listaSimples = (ruas, { comCep = false } = {}) => {
  const colunas = comCep
    ? ['Rua', 'Bairro', 'Status', 'CEP']
    : ['Rua', 'Bairro', 'Status'];

  const linhas = [...ruas].sort(porBairroENome).map((rua) => {
    const base = [rua.name || '—', nomeDoBairro(rua), rotuloDoStatus(rua.status)];
    if (!comCep) return base;
    const ceps = cepsDaRua(rua).map((c) => c.cep);
    return [...base, ceps.length ? ceps.join(' · ') : '—'];
  });

  return { colunas, linhas };
};

export const TIPOS_DE_RELATORIO = Object.freeze([
  Object.freeze({
    id: 'panorama',
    label: 'Panorama geral',
    descricao: 'Quantas ruas há em cada situação, com o gráfico de distribuição.',
    montar: () => [],
  }),
  Object.freeze({
    id: 'unpaved',
    label: 'Ruas sem pavimentação',
    descricao: 'A lista do que falta pavimentar, por bairro.',
    montar: (ruas) => {
      const alvo = ruas.filter((r) => r.status === 'unpaved');
      return alvo.length
        ? [{ titulo: `Ruas sem pavimentação (${alvo.length})`, ...listaSimples(alvo) }]
        : [];
    },
  }),
  Object.freeze({
    id: 'partially_paved',
    label: 'Ruas parcialmente pavimentadas',
    descricao: 'Onde a obra começou e não terminou.',
    montar: (ruas) => {
      const alvo = ruas.filter((r) => r.status === 'partially_paved');
      return alvo.length
        ? [{ titulo: `Ruas parcialmente pavimentadas (${alvo.length})`, ...listaSimples(alvo) }]
        : [];
    },
  }),
  Object.freeze({
    id: 'unnamed',
    label: 'Ruas sem nome oficial',
    descricao: 'As que aguardam denominação — a lista que vira projeto de lei.',
    montar: (ruas) => {
      const alvo = ruas.filter((r) => r.is_unnamed);
      if (!alvo.length) return [];
      return [{
        titulo: `Ruas sem nome oficial (${alvo.length})`,
        colunas: ['Identificação provisória', 'Bairro', 'Status'],
        linhas: [...alvo].sort(porBairroENome).map((r) => [
          r.name || '—', nomeDoBairro(r), rotuloDoStatus(r.status),
        ]),
      }];
    },
  }),
  Object.freeze({
    id: 'sem-cep',
    label: 'Ruas sem CEP cadastrado',
    descricao: 'O que ainda falta preencher na base — serve de lista de trabalho.',
    montar: (ruas) => {
      const alvo = ruas.filter((r) => cepsDaRua(r).length === 0);
      if (!alvo.length) return [];
      return [{
        titulo: `Ruas sem CEP (${alvo.length})`,
        colunas: ['Rua', 'Bairro', 'Status'],
        linhas: [...alvo].sort(porBairroENome).map((r) => [
          r.name || '—', nomeDoBairro(r), rotuloDoStatus(r.status),
        ]),
      }];
    },
  }),
  Object.freeze({
    id: 'bairros',
    label: 'Resumo por bairro',
    descricao: 'Uma linha por bairro, com a contagem de cada situação.',
    montar: (ruas) => {
      const mapa = new Map();
      for (const rua of ruas) {
        const nome = nomeDoBairro(rua);
        if (!mapa.has(nome)) mapa.set(nome, { paved: 0, partially_paved: 0, unpaved: 0, semNome: 0 });
        const conta = mapa.get(nome);
        if (Object.prototype.hasOwnProperty.call(conta, rua.status)) conta[rua.status] += 1;
        if (rua.is_unnamed) conta.semNome += 1;
      }

      const linhas = [...mapa.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([nome, c]) => {
          const total = c.paved + c.partially_paved + c.unpaved;
          return [nome, c.paved, c.partially_paved, c.unpaved, c.semNome, total];
        });

      return linhas.length
        ? [{
            titulo: 'Resumo por bairro',
            colunas: ['Bairro', 'Pavimentadas', 'Parcialmente', 'Sem pavimentação', 'Sem nome', 'Total'],
            linhas,
          }]
        : [];
    },
  }),
  Object.freeze({
    id: 'pavimento',
    label: 'Por tipo de pavimento',
    descricao: 'Asfalto, paralelepípedo, intertravado — quanto há de cada um.',
    montar: (ruas) => {
      const mapa = new Map();
      for (const rua of ruas) {
        if (rua.status === 'unpaved') continue;
        const tipo = rotuloDoPavimento(rua.pavement_type);
        mapa.set(tipo, (mapa.get(tipo) || 0) + 1);
      }

      const total = [...mapa.values()].reduce((a, b) => a + b, 0);
      const linhas = [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tipo, quantas]) => [tipo, quantas, porcentagem(quantas, total)]);

      return linhas.length
        ? [{ titulo: 'Ruas pavimentadas por tipo', colunas: ['Tipo', 'Ruas', 'Participação'], linhas }]
        : [];
    },
  }),
  Object.freeze({
    id: 'completo',
    label: 'Lista completa',
    descricao: 'Todas as ruas, com bairro, situação e CEP.',
    montar: (ruas) => (ruas.length
      ? [{ titulo: `Todas as ruas (${ruas.length})`, ...listaSimples(ruas, { comCep: true }) }]
      : []),
  }),
]);

export const tipoDeRelatorio = (id) =>
  TIPOS_DE_RELATORIO.find((t) => t.id === id) || TIPOS_DE_RELATORIO[0];

/* --- Montagem --- */

/**
 * O relatório pronto para ser desenhado.
 *
 * O resumo acompanha TODOS os tipos de propósito: mesmo quem pediu só a lista
 * das sem pavimentação precisa do total para a lista significar alguma coisa —
 * "312 ruas sem pavimentação" é um número muito diferente conforme a cidade
 * tenha 400 ou 4.000.
 */
export const montarRelatorio = (tipoId, ruas, { cidade = '', atualizadoEm = null, bairros = null } = {}) => {
  const todas = Array.isArray(ruas) ? ruas : [];
  const filtradas = Array.isArray(bairros) && bairros.length
    ? todas.filter((r) => bairros.includes(nomeDoBairro(r)))
    : todas;

  const tipo = tipoDeRelatorio(tipoId);
  const contagem = contarPorStatus(filtradas);

  return {
    tipo: tipo.id,
    titulo: `Relatório de Pavimentação${cidade ? ` — ${cidade}` : ''}`,
    subtitulo: tipo.label,
    atualizadoEm,
    recorte: Array.isArray(bairros) && bairros.length ? bairros.join(', ') : null,
    contagem,
    resumo: [
      { rotulo: 'Total de ruas', valor: contagem.total },
      { rotulo: 'Pavimentadas', valor: contagem.paved, parte: porcentagem(contagem.paved, contagem.total) },
      { rotulo: 'Parcialmente', valor: contagem.partially_paved, parte: porcentagem(contagem.partially_paved, contagem.total) },
      { rotulo: 'Sem pavimentação', valor: contagem.unpaved, parte: porcentagem(contagem.unpaved, contagem.total) },
      { rotulo: 'Sem nome oficial', valor: contagem.semNome },
      { rotulo: 'Sem CEP cadastrado', valor: contagem.semCep },
    ],
    secoes: tipo.montar(filtradas),
  };
};

/**
 * O relatório em CSV.
 *
 * POR QUE CSV, SE JÁ HÁ PDF
 *
 * O PDF é para anexar num ofício; o CSV é para trabalhar. Quem recebe a lista
 * de ruas sem pavimentação na prefeitura vai querer ordenar, somar e cruzar com
 * a planilha de orçamento — e no PDF isso vira digitação manual.
 *
 * O separador é `;` e o arquivo abre com BOM: é o que faz o Excel em português
 * reconhecer as colunas sem passar pelo assistente de importação.
 */
export const relatorioParaCsv = (relatorio) => {
  const escapar = (valor) => {
    const texto = String(valor ?? '');
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const linhas = [
    [relatorio.titulo],
    [relatorio.subtitulo],
  ];

  if (relatorio.atualizadoEm) linhas.push([`Atualizado em: ${relatorio.atualizadoEm}`]);
  if (relatorio.recorte) linhas.push([`Bairros: ${relatorio.recorte}`]);
  linhas.push([]);

  for (const item of relatorio.resumo) {
    linhas.push([item.rotulo, item.valor, item.parte || '']);
  }

  for (const secao of relatorio.secoes) {
    linhas.push([]);
    linhas.push([secao.titulo]);
    linhas.push(secao.colunas);
    for (const linha of secao.linhas) linhas.push(linha);
  }

  return `﻿${linhas.map((l) => l.map(escapar).join(';')).join('\r\n')}`;
};
