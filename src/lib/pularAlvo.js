// Pular um alvo, com motivo.
//
// POR QUE O PULO PRECISA EXISTIR
//
// Uma rota em que toda parada exige contribuição trava na primeira porta
// fechada. E rota travada não é um contratempo: é o fim da segunda rota, porque
// ninguém gera de novo o percurso que ficou pela metade.
//
// POR QUE O MOTIVO É OBRIGATÓRIO
//
// Sem motivo, o pulo é só um botão de "não quero" — e o app perde a única
// informação que aquela ida à rua produziu. O plano diz isso em uma linha: o
// pulo não é desistência, o motivo vira dado que ninguém tinha (§36.6).
//
// NEM TODO MOTIVO É UMA AFIRMAÇÃO SOBRE O PROBLEMA
//
// Esta é a distinção que o módulo inteiro existe para não perder:
//
//   • "não existe mais"      afirma sobre o problema  → vira report_updates
//   • "não consegui chegar"  afirma sobre o acesso    → não vira nada
//   • "o ponto está errado"  afirma sobre o dado      → vira auditoria
//   • "há risco no local"    afirma sobre segurança   → vira auditoria, privada
//   • "sem tempo agora"      não afirma nada          → não vira nada
//
// Transformar os cinco em atualização faria o app registrar "o problema
// continua" porque um portão estava fechado — inventando observação de campo a
// partir de logística. É o erro mais fácil de cometer aqui e o mais caro: ele
// contamina exatamente o dado que a rota existe para produzir.
//
// "NÃO EXISTE MAIS" VALE TANTO QUANTO QUALQUER OUTRA OBSERVAÇÃO
//
// É literal na §36.5, e é o motivo de este motivo virar `solved` de verdade, com
// crédito, passando pelo quórum da 199 como qualquer confirmação. Quem foi ao
// local e não encontrou o buraco fez o mesmo trabalho de quem o encontrou.

/**
 * Os cinco motivos.
 *
 * `updateType` null significa "isto não diz nada sobre o problema".
 * `auditoria` marca o que a moderação precisa olhar.
 * `privado` esconde o motivo do mural público — risco no local não pode virar
 * anúncio de qual rua está sem gente olhando (§36.6, Aposta 4).
 */
export const MOTIVOS_DE_PULO = [
  {
    id: 'nao_existe_mais',
    rotulo: 'O problema não está mais lá',
    updateType: 'solved',
    nota: 'Fui ao local e o problema não estava mais lá.',
    auditoria: false,
    privado: false,
  },
  {
    id: 'nao_consegui_chegar',
    rotulo: 'Não consegui chegar',
    detalhe: 'Portão fechado, obra bloqueando, propriedade privada.',
    updateType: null,
    nota: null,
    auditoria: false,
    privado: false,
  },
  {
    id: 'ponto_errado',
    rotulo: 'O ponto está no lugar errado',
    detalhe: 'Cheguei ao ponto e não há nada parecido por aqui.',
    updateType: null,
    // Não é "não existe mais": o problema pode existir a duas quadras. Afirmar
    // resolução a partir de coordenada errada fecharia uma bronca viva.
    nota: null,
    auditoria: true,
    privado: false,
  },
  {
    id: 'risco_no_local',
    rotulo: 'Não me senti seguro',
    updateType: null,
    nota: null,
    auditoria: true,
    privado: true,
  },
  {
    id: 'sem_tempo',
    rotulo: 'Sem tempo agora',
    updateType: null,
    nota: null,
    auditoria: false,
    privado: false,
  },
];

const POR_ID = MOTIVOS_DE_PULO.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});

export const motivoDePulo = (id) => POR_ID[id] || null;

/**
 * O que gravar quando alguém pula.
 *
 * @param {object} args
 * @param {string} args.motivoId
 * @param {object} args.alvo      { id, tipo }
 * @param {string} [args.observacao]
 * @returns {{
 *   pulo: {alvo_id:string, motivo:string, observacao:string|null},
 *   atualizacao: {report_id:string, update_type:string, message:string}|null,
 *   auditoria: {report_id:string, motivo:string, observacao:string|null}|null,
 * }|null}
 */
export const envioDoPulo = ({ motivoId, alvo, observacao = '' } = {}) => {
  const motivo = motivoDePulo(motivoId);
  if (!motivo || !alvo?.id) return null;

  const escrito = typeof observacao === 'string' ? observacao.trim() : '';

  return {
    pulo: {
      alvo_id: String(alvo.id),
      motivo: motivo.id,
      observacao: escrito || null,
    },
    atualizacao: motivo.updateType
      ? {
          report_id: String(alvo.id),
          update_type: motivo.updateType,
          message: [motivo.nota, escrito].filter(Boolean).join(' '),
        }
      : null,
    auditoria: motivo.auditoria
      ? {
          report_id: String(alvo.id),
          motivo: motivo.id,
          observacao: escrito || null,
        }
      : null,
  };
};

/**
 * O que dizer depois do pulo.
 *
 * Nunca "tudo bem, siga em frente": quando o pulo produziu informação, a pessoa
 * precisa saber disso. É a diferença entre pular e falhar — e é o que faz o
 * segundo pulo continuar sendo respondido com honestidade em vez de com o
 * motivo mais rápido de tocar.
 */
export const retornoDoPulo = (motivoId) => {
  const motivo = motivoDePulo(motivoId);
  if (!motivo) return null;

  if (motivo.updateType) {
    return 'Registramos como uma verificação de campo. Ir e não encontrar vale tanto quanto ir e encontrar.';
  }
  if (motivo.auditoria) {
    return 'A moderação vai conferir este ponto. Obrigado por avisar.';
  }
  return 'Anotado. A parada sai do seu percurso sem prejuízo.';
};
