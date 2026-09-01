// Colaborar na bronca que já existe, em vez de criar a segunda.
//
// O PROBLEMA QUE ISTO RESOLVE
//
// Cinco vizinhos veem o mesmo buraco e registram cinco broncas. O mapa fica com
// cinco pinos onde há um problema, a prefeitura recebe cinco protocolos do
// mesmo caso, e o apoio — que é o que move a fila — fica dividido por cinco.
//
// Pior: a moderação gasta o tempo dela fechando duplicata em vez de conferir
// bronca nova, e o autor da quinta recebe "duplicada" como se tivesse errado.
// Ele não errou. Ele viu o problema e quis ajudar.
//
// A SAÍDA NÃO É BLOQUEAR
//
// Um app que recusa o registro por proximidade erra em duas direções: recusa o
// buraco de verdade que fica a 30 m do outro, e ensina que insistir funciona
// (basta andar meio quarteirão). Por isso este módulo SUGERE, e a última opção
// da lista é sempre "é outro problema, quero registrar" — sem atrito.
//
// AS CINCO OPÇÕES SÃO DO PLANO
//
// §36.6, Aposta 5: confirmar que continua, informar mudança, adicionar outro
// ângulo, dizer que não existe mais, pedir auditoria quando houver conflito.
// Cada uma vira o dado que ela de fato é — e nenhuma vira "duplicada".
//
// CRÉDITO PRESERVADO
//
// Quem colabora recebe crédito de participação na bronca existente (é o que
// `report_participants` já faz, e o que `creditoNaBronca` mostra no recibo). A
// §36.5 é explícita: contribuição fundida como duplicata preserva o crédito
// útil do autor. Colaborar não pode render menos que duplicar.

import { haversine } from './navGeo.js';

/**
 * Até onde duas observações provavelmente falam da mesma coisa.
 *
 * Por categoria, porque o raio de um problema não é uma constante do universo:
 * um poste apagado é um ponto (o poste ao lado é outro poste, e outra bronca),
 * enquanto alagamento e limpeza pegam a esquina inteira.
 *
 * Errar para menos é barato: sugere-se colaboração de menos e nasce uma
 * duplicata que a moderação funde. Errar para mais é caro: o app empurra a
 * pessoa a "confirmar" um problema que ela não está vendo — e passa a produzir
 * confirmação falsa em escala, que é pior que duplicata.
 */
export const RAIO_POR_CATEGORIA = Object.freeze({
  iluminacao: 25,
  buracos: 40,
  esgoto: 60,
  limpeza: 80,
  poda: 30,
  'vazamento-de-agua': 60,
  outros: 50,
});

export const RAIO_PADRAO_M = 50;

export const raioDaCategoria = (categoriaId) =>
  RAIO_POR_CATEGORIA[categoriaId] ?? RAIO_PADRAO_M;

/**
 * As formas de colaborar.
 *
 * `updateType` null em `auditoria` e `outro_problema` porque nenhuma das duas
 * afirma coisa alguma sobre o estado do problema: a primeira pede que alguém
 * olhe, a segunda diz que estamos falando de outra coisa.
 *
 * `exigeFoto` só em "outro ângulo": é literalmente o que a opção oferece. Nas
 * demais a foto é bem-vinda e não obrigatória — exigir foto para dizer "continua
 * lá" transformaria a resposta de um toque numa tarefa, e a resposta de um toque
 * é a que a maioria das pessoas de fato dá.
 */
export const FORMAS_DE_COLABORAR = [
  {
    id: 'continua',
    rotulo: 'Continua igual',
    descricao: 'Confirmo que o problema segue lá.',
    updateType: 'still_here',
    exigeFoto: false,
  },
  {
    id: 'mudou',
    rotulo: 'Mudou desde o registro',
    descricao: 'Piorou, melhorou ou começaram a mexer.',
    updateType: 'being_solved',
    exigeFoto: false,
  },
  {
    id: 'outro_angulo',
    rotulo: 'Tenho outra foto',
    descricao: 'Mesma coisa, de outro ângulo ou com mais detalhe.',
    updateType: 'still_here',
    exigeFoto: true,
  },
  {
    id: 'nao_existe_mais',
    rotulo: 'Não está mais lá',
    descricao: 'Fui ao local e o problema acabou.',
    updateType: 'solved',
    exigeFoto: false,
  },
  {
    id: 'auditoria',
    rotulo: 'Algo está errado aqui',
    descricao: 'O ponto, a categoria ou a descrição não batem.',
    updateType: null,
    exigeFoto: false,
    auditoria: true,
  },
  {
    id: 'outro_problema',
    rotulo: 'É outro problema',
    descricao: 'Quero registrar uma bronca nova.',
    updateType: null,
    exigeFoto: false,
    registraNova: true,
  },
];

export const formaDeColaborar = (id) =>
  FORMAS_DE_COLABORAR.find((f) => f.id === id) || null;

const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * Há uma bronca aberta que provavelmente é esta mesma?
 *
 * Só broncas ABERTAS entram. Uma bronca resolvida no mesmo ponto não é
 * duplicata do que a pessoa está vendo — é a prova de que o problema voltou, e
 * voltar merece registro próprio com data própria. Sugerir "confirme que
 * continua" ali reabriria um caso encerrado com uma observação que fala de
 * outro acontecimento.
 *
 * @param {object} args
 * @param {{lat:number,lng:number}} args.posicao
 * @param {string} args.categoriaId
 * @param {Array}  args.existentes  broncas próximas já carregadas
 * @returns {{report:object, distancia:number, raio:number}|null}
 */
export const broncaParecida = ({ posicao, categoriaId, existentes = [] } = {}) => {
  if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) {
    return null;
  }
  const raio = raioDaCategoria(categoriaId);

  const candidatas = lista(existentes)
    .filter(
      (r) =>
        r &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng) &&
        // Categoria diferente é problema diferente, por mais perto que esteja:
        // um poste apagado sobre um buraco são duas broncas, e fundi-las
        // perderia uma das duas.
        r.category_id === categoriaId &&
        ['pending', 'in-progress', 'pending_resolution'].includes(r.status)
    )
    .map((r) => ({ report: r, distancia: haversine(posicao, r), raio }))
    .filter((c) => c.distancia <= raio)
    .sort((a, b) => a.distancia - b.distancia);

  return candidatas[0] || null;
};

/**
 * O que oferecer, para esta pessoa, nesta bronca.
 *
 * Quem registrou não confirma o próprio registro — mesma regra da 199, e pelo
 * mesmo motivo: a voz de quem tem interesse abre a verificação, não a encerra.
 * Para o autor sobram as opções que não são confirmação: informar mudança,
 * trazer outra foto, dizer que acabou (que continua sendo reivindicação, e o
 * banco trata como tal) e pedir auditoria.
 */
export const opcoesPara = ({ report, user } = {}) => {
  const interessado =
    !!user?.id && (report?.author_id === user.id || report?.completed_by === user.id);

  return FORMAS_DE_COLABORAR.filter((f) => !(interessado && f.id === 'continua'));
};

/**
 * O que enviar quando a pessoa escolhe colaborar.
 *
 * @returns {{
 *   registraNova:boolean,
 *   atualizacao:{report_id:string, update_type:string, message:string|null}|null,
 *   auditoria:{report_id:string, motivo:string, observacao:string|null}|null,
 * }|null}
 */
export const envioDaColaboracao = ({ formaId, report, mensagem = '' } = {}) => {
  const forma = formaDeColaborar(formaId);
  if (!forma || !report?.id) return null;

  const escrito = typeof mensagem === 'string' ? mensagem.trim() : '';

  return {
    registraNova: !!forma.registraNova,
    atualizacao: forma.updateType
      ? {
          report_id: report.id,
          update_type: forma.updateType,
          message: escrito || null,
        }
      : null,
    auditoria: forma.auditoria
      ? {
          report_id: report.id,
          motivo: 'colaboracao',
          observacao: escrito || null,
        }
      : null,
  };
};

/**
 * O texto do convite.
 *
 * Diz a distância porque é o que permite discordar com base em algo. "Existe
 * uma bronca parecida" é uma afirmação que a pessoa tem que aceitar; "há uma
 * bronca de buraco a 12 m daqui" é uma que ela pode conferir olhando para o
 * lado — e discordar sem se sentir contrariada pelo aplicativo.
 */
export const conviteDeColaboracao = ({ report, distancia } = {}) => {
  if (!report) return null;
  const metros = Math.round(Number(distancia) || 0);

  return {
    titulo: 'Já existe uma bronca aqui',
    texto: `"${report.title || 'Uma bronca'}" foi registrada a ${metros} m daqui. Colaborar com ela vale mais que abrir outra: o apoio não se divide e a prefeitura recebe um caso, não dois.`,
  };
};
