// O portao de preferencia por tipo de notificacao.
//
// POR QUE ESTE ARQUIVO ESTAVA FALTANDO
//
// `index.ts` importa `isTypePreferenceDisabled` daqui desde sempre, mas o
// arquivo nunca entrou no git — nenhum commit o menciona, e ele nao esta no
// `.gitignore`. Ou seja: ele existia so na maquina de quem fez o ultimo deploy.
//
// Duas consequencias, e as duas doem:
//
//   1. `supabase functions deploy send-push-notification` a partir do
//      repositorio nao resolve `./gate.js`. O deploy falha, ou publica uma
//      funcao que nao sobe — e push nenhum sai, de tipo nenhum, sem erro
//      visivel para quem usa o app;
//   2. a regra que decide se um alerta chega ao aparelho de alguem nao podia ser
//      revisada por ninguem.
//
// O comportamento abaixo e o que `index.ts` descreve nos proprios comentarios,
// nas linhas em volta da chamada. Reconstruir a partir dali e o que mantem o
// deploy fiel ao que ja rodava.
//
// A REGRA: SO `false` EXPLICITO DESLIGA
//
// Ausente significa LIGADO. E deliberado, e e o unico padrao seguro num sistema
// em que tipos novos aparecem antes de a tela de preferencias conhece-los: um
// tipo desconhecido tratado como desligado silenciaria alertas que ninguem
// pediu para silenciar — e o silencio nao aparece em log nenhum.
//
// (A migracao 217 grava as chaves do Trombone Agora como `true` justamente para
// que esse padrao deixe de ser a unica coisa segurando a entrega.)

/** Aceita `false` e `"false"`: a tela de preferencias ja tratou os dois. */
const desligadoExplicitamente = (valor) => valor === false || valor === 'false';

/**
 * `moderation_required` NAO e decidido aqui.
 *
 * Quem decide esse tipo e o portao de admin em `index.ts`, logo acima da
 * chamada: allowlist por variavel de ambiente, ou `profiles.is_admin`. Deixar a
 * preferencia do usuario tambem valer criaria duas autoridades sobre a mesma
 * decisao — e a que o produto quer e a de admin, porque o aviso de moderacao
 * existe para a operacao, nao para o gosto de quem o recebe.
 */
const DECIDIDOS_FORA = new Set(['moderation_required']);

/**
 * O tipo esta explicitamente desabilitado nas preferencias?
 *
 * @param {Record<string, unknown>|null|undefined} preferencias  ja convertido
 *   para objeto por `index.ts` (a coluna pode chegar como string JSON).
 * @param {string} tipo  o `notifications.type` da linha.
 * @returns {boolean} `true` somente quando ha um `false` explicito.
 */
export function isTypePreferenceDisabled(preferencias, tipo) {
  if (!tipo) return false;
  if (DECIDIDOS_FORA.has(tipo)) return false;
  if (!preferencias || typeof preferencias !== 'object') return false;

  return desligadoExplicitamente(preferencias[tipo]);
}

export default { isTypePreferenceDisabled };
