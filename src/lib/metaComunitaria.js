// A meta comunitária, e o relatório do que ela produziu.
//
// O EXEMPLO DO PLANO É LITERAL
//
// "Atualizar a situação de 80% das ruas no entorno de duas escolas" (§36.7). O
// que faz esse enunciado funcionar não é o número: é que o denominador está
// sob controle de quem participa. Ninguém precisa da prefeitura para a barra
// andar, e a barra não pode ser confundida com o conserto de nada.
//
// O PLACAR PRINCIPAL É COLETIVO — E NÃO É UMA PREFERÊNCIA DE TOM
//
// A §36.7 é explícita: o placar principal mostra progresso coletivo, e "nunca
// usar XP bruto de bairros como indicador de cidadania". Um ranking individual
// dentro de uma meta de bairro produz três coisas ruins de uma vez: transforma
// vizinhos em concorrentes por um bem público, faz quem chegou depois desistir,
// e mede tempo livre em vez de contribuição.
//
// Então a contribuição individual existe (as pessoas querem saber que ajudaram)
// e ela NÃO é ordenada. `participacao` devolve a lista ordenada por nome, e o
// número que ela devolve é "quantas ruas você verificou", não posição.
//
// COMPARAÇÃO ENTRE TIMES SÓ ENTRE COMPARÁVEIS
//
// O experimento citado no plano (§36.17) encontrou melhores resultados para
// competição entre TIMES que para ranking individual — e o plano trata isso
// como autorização para um piloto controlado, não para uma batalha de bairros.
// `timesComparaveis` é onde esse "controlado" vira código: times de tamanho e
// oportunidade muito diferentes não são comparados, e a tela precisa saber
// disso antes de desenhar dois números lado a lado.
//
// O RELATÓRIO PÚBLICO É PARTE DA META, NÃO UM EXTRA
//
// A entrega da fase 3 inclui "relatório público do que foi produzido e usado"
// — e a segunda metade é a que costuma sumir. Dizer quantas ruas foram
// verificadas é fácil; dizer o que a prefeitura fez com isso é o que sustenta a
// próxima meta. Por isso `relatorioPublico` exige `uso` e diz, em texto, quando
// ele não existe.

import { coberturaDaArea } from './cobertura.js';

/** Estados de uma meta. */
export const RASCUNHO = 'rascunho';
export const ABERTA = 'aberta';
export const ENCERRADA = 'encerrada';

/**
 * Diferença máxima de tamanho para dois times serem comparáveis.
 *
 * Um bairro com 90 ruas e outro com 20 não disputam a mesma coisa: o segundo
 * fecha 100% com um sábado e o primeiro não fecha nunca. Um fator de 2 é
 * estreito o bastante para a comparação significar esforço, e largo o bastante
 * para não exigir times idênticos — que não existem numa cidade real.
 */
export const FATOR_MAXIMO_DE_TAMANHO = 2;

const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * O progresso da meta.
 *
 * A barra é a fração de ruas cobertas sobre o total da área, comparada ao alvo.
 * `atingida` usa o alvo, não 100%: uma meta de 80% que chega a 80% está
 * cumprida, e continuar mostrando "faltam 20%" transformaria sucesso em dívida.
 *
 * @param {object} meta      { alvo_percentual, status, inicio, fim }
 * @param {Array}  ruas      cada uma como { rua, sugestoes }
 * @param {Date}   [agora]
 */
export const progressoDaMeta = (meta, ruas = [], agora = new Date()) => {
  const cobertura = coberturaDaArea(ruas, agora);
  const alvo = Math.min(1, Math.max(0, (Number(meta?.alvo_percentual) || 80) / 100));

  const fim = meta?.fim ? new Date(meta.fim) : null;
  const diasRestantes = fim
    ? Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / 86400000))
    : null;

  const ruasParaAlvo = Math.ceil(cobertura.total * alvo);

  return {
    cobertura,
    alvo,
    ruasParaAlvo,
    faltamParaAlvo: Math.max(0, ruasParaAlvo - cobertura.cobertos),
    atingida: cobertura.cobertos >= ruasParaAlvo && cobertura.total > 0,
    // A barra mede o caminho até o ALVO, não até 100%. Uma barra que só enche
    // em 100% faz a meta de 80% parecer eternamente inacabada.
    fracao: ruasParaAlvo > 0 ? Math.min(1, cobertura.cobertos / ruasParaAlvo) : 0,
    diasRestantes,
    encerrada: meta?.status === ENCERRADA || (diasRestantes === 0 && !!fim),
    rotulo: `${cobertura.cobertos} de ${ruasParaAlvo} ruas`,
  };
};

/**
 * Quem participou, sem ordenar por quantidade.
 *
 * A ordem é alfabética de propósito. Ordenar por contribuição cria o ranking
 * que a meta coletiva existe para não ter — e a diferença entre "você verificou
 * 3 ruas" e "você é o 14º colocado" é a diferença entre reconhecimento e
 * competição por um bem público.
 */
export const participacao = (sugestoes = []) => {
  const porPessoa = new Map();

  for (const s of lista(sugestoes)) {
    if (!s?.user_id || s.status === 'recusada' || s.local_confere === false) continue;
    const atual = porPessoa.get(s.user_id) || {
      userId: s.user_id,
      nome: s.autor?.name || 'Alguém',
      ruas: new Set(),
    };
    atual.ruas.add(String(s.street_id));
    porPessoa.set(s.user_id, atual);
  }

  return [...porPessoa.values()]
    .map((p) => ({ userId: p.userId, nome: p.nome, ruas: p.ruas.size }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

/**
 * Estes times podem ser comparados?
 *
 * Devolve o motivo quando não podem, porque a tela precisa dizer por que a
 * comparação não aparece — e porque "não comparável" é, ele mesmo, uma
 * informação honesta sobre a cidade.
 *
 * @param {Array} times  cada um como { id, nome, totalDeRuas, cobertas }
 */
export const timesComparaveis = (times = []) => {
  const ts = lista(times).filter((t) => Number(t?.totalDeRuas) > 0);
  if (ts.length < 2) {
    return { ok: false, motivo: 'poucos', texto: 'Não há dois grupos para comparar.' };
  }

  const tamanhos = ts.map((t) => Number(t.totalDeRuas));
  const maior = Math.max(...tamanhos);
  const menor = Math.min(...tamanhos);

  if (maior > menor * FATOR_MAXIMO_DE_TAMANHO) {
    return {
      ok: false,
      motivo: 'tamanhos',
      texto:
        'Os grupos têm tamanhos muito diferentes. Comparar mediria o tamanho do bairro, não o esforço de quem mora nele.',
    };
  }

  return { ok: true, motivo: null, texto: null };
};

/**
 * O relatório público da meta.
 *
 * `uso` é o que a prefeitura ou o embaixador fez com o dado. É obrigatório na
 * assinatura e opcional na realidade — e quando não existe, o relatório DIZ que
 * não existe, em vez de omitir a seção.
 *
 * Omitir seria a versão silenciosa da mesma promessa que "encaminhada" fazia na
 * fase 1: dar a entender que o dado chegou a algum lugar porque ninguém disse o
 * contrário.
 */
export const relatorioPublico = ({ meta, progresso, participantes = [], uso = null } = {}) => {
  if (!meta || !progresso) return null;

  const totalPessoas = lista(participantes).length;
  const totalRuas = progresso.cobertura.cobertos;

  return {
    titulo: meta.titulo || 'Meta comunitária',
    periodo: { inicio: meta.inicio || null, fim: meta.fim || null },

    produzido: {
      ruasVerificadas: totalRuas,
      ruasNaArea: progresso.cobertura.total,
      pessoas: totalPessoas,
      texto:
        totalRuas === 0
          ? 'Nenhuma rua recebeu verificação confirmada nesta meta.'
          : `${totalRuas} ruas passaram a ter verificação confirmada por duas pessoas, com participação de ${totalPessoas} ${
              totalPessoas === 1 ? 'moradora ou morador' : 'moradoras e moradores'
            }.`,
    },

    // A metade que costuma sumir dos relatórios cívicos.
    usado: uso
      ? { ...uso, texto: uso.texto || 'O dado foi encaminhado e utilizado.' }
      : {
          texto:
            'Ainda não há registro de uso deste dado pelo poder público. Quando houver, ele aparece aqui — e enquanto não houver, esta linha continua dizendo isso.',
        },

    // Equidade entra no relatório PÚBLICO como distribuição, não como ranking
    // de bairro: mostrar que o esforço se espalhou é diferente de apontar quem
    // ficou para trás.
    distribuicao: progresso.cobertura.porBairro
      .filter((b) => b.total >= 3)
      .map((b) => ({
        nome: b.nome || 'Sem bairro',
        cobertas: b.cobertos,
        total: b.total,
      })),

    atingida: progresso.atingida,
  };
};
