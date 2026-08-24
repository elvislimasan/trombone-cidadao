// A reserva do corredor: as broncas guardadas para quando a rede sumir.
//
// O QUE ISTO RESOLVE
//
// A fila offline (offlineQueue.js) cuida do que a pessoa PRODUZ. Só que metade
// da patrulha é o contrário disso: o app precisa SABER o que existe em volta
// para avisar. Sem rede e sem nada guardado, a patrulha vira um cronômetro que
// não alerta nada — a pessoa anda cinco quilômetros e passa em frente a três
// buracos sem o app dizer uma palavra.
//
// O corredor normal (useNavCorridor) já mantém o último resultado em memória.
// Isso cobre uma queda curta, e só: some quando o app reinicia, e cobre apenas
// os 2 km em volta do último ponto com sinal.
//
// A reserva é maior e persistente. Ela é buscada UMA vez, no início da saída,
// enquanto ainda há sinal — e é dela que os alertas saem pelo resto do trajeto
// se a conexão não voltar.
//
// POR QUE POR CATEGORIA
//
// A patrulha é de um tipo só, e o filtro é aplicado no servidor. Guardar tudo
// junto obrigaria a refiltrar na leitura e traria postes para uma saída de
// buracos — que é o que a separação por categoria existe para evitar.

import { comLoja as comLojaDo, indexedDbDisponivel, LOJA_CORREDOR } from '@/lib/offlineDb';

/**
 * Quanto tempo a reserva vale.
 *
 * Doze horas. Bronca resolvida não desaparece do mapa no mesmo dia, e o custo
 * de alertar sobre uma que já foi consertada é pequeno: a pessoa responde
 * "resolvido", que é informação útil. O custo de NÃO alertar é perder a bronca.
 */
export const VALIDADE_MS = 12 * 60 * 60 * 1000;

const disponivel = indexedDbDisponivel;
const comLoja = (modo, fn) => comLojaDo(LOJA_CORREDOR, modo, fn);

/** `null` vira uma chave própria: patrulha sem categoria já existiu. */
const chave = (categoria) => categoria || '__todas__';

export const guardarReserva = async (categoria, broncas, centro) => {
  if (!disponivel()) return;
  try {
    await comLoja('readwrite', (store) =>
      store.put({
        categoria: chave(categoria),
        broncas: broncas || [],
        centro,
        em: Date.now(),
      })
    );
  } catch (err) {
    console.error('[corridorCache] não foi possível guardar a reserva:', err);
  }
};

/**
 * A reserva guardada, se ainda valer.
 *
 * @returns {Promise<{broncas:Array, centro:object, em:number}|null>}
 */
export const lerReserva = async (categoria) => {
  if (!disponivel()) return null;
  try {
    const r = await comLoja('readonly', (store) => store.get(chave(categoria)));
    if (!r) return null;
    if (Date.now() - r.em > VALIDADE_MS) return null;
    return r;
  } catch (err) {
    console.error('[corridorCache] não foi possível ler a reserva:', err);
    return null;
  }
};

export const limparReserva = async () => {
  try {
    await comLoja('readwrite', (store) => store.clear());
  } catch {}
};
