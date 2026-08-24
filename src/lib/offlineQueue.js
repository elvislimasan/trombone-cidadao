// A fila do que ainda não subiu.
//
// O PROBLEMA QUE ELA RESOLVE
//
// GPS é satélite: rastro, distância e duração continuam corretos sem uma barra
// de sinal. O que precisa de rede é só o ENVIO — e ele acontece exatamente onde
// a rede costuma faltar, que é a rua.
//
// Sem fila, uma bronca fotografada num lugar sem cobertura some junto com a
// tentativa. É o único prejuízo irrecuperável do modo patrulha: a pessoa
// desceu do carro, andou até o poste, tirou a foto — e o app perdeu.
//
// POR QUE IndexedDB E NÃO localStorage
//
// Fotos. `localStorage` guarda string, então um JPEG viraria base64 — 33% maior
// e contando contra um limite de ~5 MB. IndexedDB guarda Blob direto, sem
// conversão, com cota de centenas de MB.
//
// Este arquivo é só o armazém: ele não sabe enviar nada, e é de propósito.
// Quem sabe é `offlineSenders.js`. A separação é o que permite testar a fila
// sem tocar em rede, e trocar o envio sem tocar na fila.

import { comLoja as comLojaDo, indexedDbDisponivel, LOJA_FILA } from '@/lib/offlineDb';

/** Quantas vezes tentar antes de desistir e pedir socorro ao usuário. */
export const MAX_TENTATIVAS = 5;

// A abertura do banco mora em offlineDb.js, compartilhada com a reserva do
// corredor. Ver o cabeçalho de lá: duas aberturas independentes com números de
// versão diferentes quebram uma das duas, e qual delas depende da ordem de
// importação.
const disponivel = indexedDbDisponivel;
const comLoja = (modo, fn) => comLojaDo(LOJA_FILA, modo, fn);

const novoId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Põe uma ação na fila.
 *
 * @param {string} tipo    qual remetente vai enviar isto (ver offlineSenders)
 * @param {object} dados   payload serializável — nada de File aqui
 * @param {File[]} [fotos] arquivos que precisam subir junto
 * @param {object} [meta]  o que o remetente precisa saber mas NÃO vai na
 *                         requisição (ex.: o id do usuário, usado só para
 *                         montar o caminho da foto no storage). Misturar isso
 *                         em `dados` mandaria um parâmetro a mais para a RPC,
 *                         que recusa argumento desconhecido.
 * @returns {Promise<string|null>} o id da ação, ou null se não deu para guardar
 *
 * O id é gerado AQUI e viaja com a ação até o servidor. É ele que torna o
 * reenvio seguro: se o app morrer depois de gravar no banco e antes de apagar
 * da fila, a segunda tentativa manda o mesmo id e o servidor reconhece.
 */
export const enfileirar = async (tipo, dados, fotos = [], meta = {}) => {
  if (!disponivel()) return null;

  const item = {
    id: novoId(),
    tipo,
    dados,
    meta,
    // Guardado como Blob puro: File não sobrevive à serialização estruturada em
    // todos os navegadores, então nome e tipo viajam ao lado.
    fotos: (fotos || []).map((f) => ({
      blob: f,
      name: f?.name || 'foto.jpg',
      type: f?.type || 'image/jpeg',
    })),
    criadoEm: Date.now(),
    tentativas: 0,
    ultimoErro: null,
  };

  try {
    await comLoja('readwrite', (store) => store.put(item));
    return item.id;
  } catch (err) {
    console.error('[offlineQueue] não foi possível enfileirar:', err);
    return null;
  }
};

/** Tudo que está esperando, na ordem em que aconteceu. */
export const listar = async () => {
  try {
    const tudo = await comLoja('readonly', (store) => store.getAll());
    return (tudo || []).sort((a, b) => a.criadoEm - b.criadoEm);
  } catch (err) {
    console.error('[offlineQueue] não foi possível ler a fila:', err);
    return [];
  }
};

export const contar = async () => {
  try {
    const n = await comLoja('readonly', (store) => store.count());
    return n || 0;
  } catch {
    return 0;
  }
};

export const remover = async (id) => {
  try {
    await comLoja('readwrite', (store) => store.delete(id));
  } catch (err) {
    console.error('[offlineQueue] não foi possível remover:', err);
  }
};

/**
 * Registra uma tentativa que falhou.
 *
 * Falha de REDE não gasta tentativa: continuar sem sinal não é culpa do item, e
 * contar isso o mataria depois de cinco quedas de conexão. Só erro do servidor
 * conta — esse tende a se repetir igual para sempre.
 */
export const marcarFalha = async (id, mensagem, { deRede = false } = {}) => {
  try {
    await comLoja('readwrite', (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return;
        store.put({
          ...item,
          tentativas: deRede ? item.tentativas : item.tentativas + 1,
          ultimoErro: mensagem || null,
        });
      };
    });
  } catch (err) {
    console.error('[offlineQueue] não foi possível marcar a falha:', err);
  }
};

/** Volta os Blobs guardados para Files, prontos para upload. */
export const arquivosDe = (item) =>
  (item?.fotos || [])
    .filter((f) => f?.blob instanceof Blob)
    .map((f) => new File([f.blob], f.name, { type: f.type }));

export const limpar = async () => {
  try {
    await comLoja('readwrite', (store) => store.clear());
  } catch {}
};
