// O banco local, aberto num lugar só.
//
// POR QUE ISTO EXISTE
//
// Duas coisas guardam dado offline: a fila do que precisa subir
// (offlineQueue.js) e a reserva do corredor (corridorCache.js). As duas usam o
// mesmo banco IndexedDB.
//
// Se cada uma abrisse por conta própria, elas precisariam concordar no número
// da versão — e no dia em que uma subisse para 2 sem a outra, o
// `indexedDB.open` da que ficou em 1 lançaria `VersionError` e aquela metade do
// offline pararia de funcionar em silêncio. Pior: quem abrisse primeiro
// venceria, então o defeito dependeria da ordem de importação.
//
// Aqui a versão é uma, o `onupgradeneeded` conhece TODAS as lojas, e acrescentar
// a próxima é acrescentar uma linha neste arquivo.
//
// ⚠️ AO CRIAR UMA LOJA NOVA: suba VERSAO e acrescente o `if` correspondente.
// Nunca remova os `if` das lojas antigas — o upgrade roda em bancos que estão
// em qualquer versão anterior, inclusive a zero.

const NOME = 'tc_offline';
const VERSAO = 2;

export const LOJA_FILA = 'fila_v1';
export const LOJA_CORREDOR = 'corredor_v1';

export const indexedDbDisponivel = () => typeof indexedDB !== 'undefined';

export const abrirBanco = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, VERSAO);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(LOJA_FILA)) {
        const fila = db.createObjectStore(LOJA_FILA, { keyPath: 'id' });
        // Ordem de chegada: a fila precisa sair na ordem em que aconteceu, ou
        // uma bronca criada depois de uma confirmação apareceria antes dela na
        // linha do tempo de quem lê o feed.
        fila.createIndex('criadoEm', 'criadoEm');
      }

      if (!db.objectStoreNames.contains(LOJA_CORREDOR)) {
        db.createObjectStore(LOJA_CORREDOR, { keyPath: 'categoria' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Roda `fn` dentro de uma transação e devolve o resultado dela.
 *
 * O valor sai no `oncomplete`, não no `onsuccess` da requisição: só quando a
 * transação fecha é que a escrita está garantida. Resolver antes devolveria
 * sucesso para algo que ainda pode abortar.
 */
export const comLoja = async (loja, modo, fn) => {
  if (!indexedDbDisponivel()) return null;
  const db = await abrirBanco();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, modo);
      let resultado;
      try {
        resultado = fn(tx.objectStore(loja));
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(resultado?.result ?? resultado);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
