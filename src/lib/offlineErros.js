// Classificar a falha é a decisão mais importante da fila offline.
//
// POR QUE ELA MORA SOZINHA NUM ARQUIVO
//
// Errar para qualquer um dos lados estraga a fila:
//
//   • tratar erro do SERVIDOR como rede → o item nunca gasta tentativa e fica
//     tentando para sempre; o contador de pendentes não zera nunca;
//   • tratar erro de REDE como servidor → cinco quedas de sinal queimam as
//     cinco tentativas e a bronca fotografada é descartada, que é exatamente o
//     prejuízo que a fila existe para impedir.
//
// Aqui não há import de supabase nem de IndexedDB, então isto roda em
// `node --test` — e roda, porque a regra é frágil demais para viver sem teste.

/**
 * A falha foi de conexão?
 *
 * `navigator.onLine === false` é a única certeza que existe. O resto é
 * reconhecimento de texto, porque cada navegador escreve o erro de rede com
 * palavras próprias: Chrome diz "Failed to fetch", Firefox diz "NetworkError",
 * Safari diz "Load failed".
 */
export const ehErroDeRede = (err, { online = null } = {}) => {
  const estaOffline =
    online === null
      ? typeof navigator !== 'undefined' && navigator.onLine === false
      : online === false;
  if (estaOffline) return true;

  // Erro do Postgres tem código. Se veio código, a resposta CHEGOU — logo a
  // rede funcionou, por pior que seja o conteúdo.
  if (err?.code && /^[0-9A-Z]{5}$/.test(String(err.code))) return false;

  const texto = String(err?.message || err || '').toLowerCase();
  return (
    texto.includes('failed to fetch') ||
    texto.includes('networkerror') ||
    texto.includes('network request failed') ||
    texto.includes('load failed') ||
    texto.includes('timeout') ||
    texto.includes('err_internet_disconnected')
  );
};

/**
 * O servidor recusou por REGRA — e a regra não muda sozinha com o tempo.
 *
 * Estes itens são descartados com aviso, que é a política combinada: insistir
 * neles entupiria a fila para sempre.
 *
 *   P0002  missão indisponível — outra pessoa registrou o ponto antes
 *   23505  chave duplicada — reenvio de algo que já tinha subido
 *   22023  campo obrigatório faltando — a tela deixou passar; não melhora
 */
export const ehRecusaDefinitiva = (err) => {
  const codigo = String(err?.code || '');
  if (codigo === 'P0002' || codigo === '23505' || codigo === '22023') return true;

  const texto = String(err?.message || '').toLowerCase();
  return (
    texto.includes('missao indisponivel') ||
    texto.includes('fora do local') ||
    texto.includes('titulo obrigatorio')
  );
};

/** O que dizer à pessoa quando um item é descartado. */
export const motivoDoDescarte = (err) => {
  const codigo = String(err?.code || '');
  const texto = String(err?.message || '').toLowerCase();

  if (codigo === 'P0002' || texto.includes('missao indisponivel')) {
    return 'outra pessoa registrou este ponto antes';
  }
  if (texto.includes('fora do local')) {
    return 'o envio saiu de um lugar diferente de onde a ação aconteceu';
  }
  if (codigo === '23505') return 'já tinha sido enviado';
  return err?.message || 'recusado pelo servidor';
};
