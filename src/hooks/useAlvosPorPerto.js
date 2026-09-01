import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// Há o que fazer por aqui hoje?
//
// POR QUE ISTO PRECISOU EXISTIR
//
// A guarda contra diária impossível está escrita em `dailies.js` desde a 200 —
// e nunca recebeu um valor. `temAlvos` tinha default `true` e nenhum chamador o
// informava, então a proteção existia desligada: numa cidade sem nenhum sinal
// pendente, "confira 2 pontos marcados" era sorteada do mesmo jeito, e a pessoa
// passava o dia procurando o que não existe.
//
// DUAS CONTAGENS, NÃO UM BOOLEANO
//
// Bronca e sinal são alvos de diárias diferentes. Um `temAlvos` único faria a
// diária de sinal ser sorteada por causa da existência de broncas — e é
// justamente numa cidade nova, cheia de bronca e ainda sem nenhum sinal, que o
// erro apareceria.
//
// SEM POSIÇÃO, ASSUME QUE HÁ
//
// Quem recusou o GPS não pode ficar sem diária de campo: a pessoa sabe onde
// mora, e o app não. O padrão otimista devolve o comportamento anterior a esta
// verificação, que é o correto quando não se sabe — a guarda existe para o caso
// em que sabemos que NÃO há.

const RAIO_M = 2000;

export function useAlvosPorPerto(posicao) {
  const [alvos, setAlvos] = useState({ temBroncas: true, temSinais: true });

  useEffect(() => {
    let vivo = true;
    if (!posicao || !Number.isFinite(posicao.lat) || !Number.isFinite(posicao.lng)) {
      return () => {};
    }

    (async () => {
      const { data, error } = await supabase.rpc('alvos_por_perto', {
        p_lat: posicao.lat,
        p_lng: posicao.lng,
        p_raio_m: RAIO_M,
      });

      if (!vivo) return;
      // Erro de RPC também cai no otimista: se a 212 ainda não estiver
      // aplicada, esconder as diárias de campo seria pior que mostrá-las.
      if (error) return;

      const linha = Array.isArray(data) ? data[0] : data;
      setAlvos({
        temBroncas: Number(linha?.broncas ?? 0) > 0,
        temSinais: Number(linha?.sinais ?? 0) > 0,
      });
    })();

    return () => {
      vivo = false;
    };
    // Só lat/lng: `usePosicaoAproximada` devolve um objeto novo a cada leitura
    // do GPS, e depender dele refaria a consulta a cada tremida de sinal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicao?.lat, posicao?.lng]);

  return alvos;
}
