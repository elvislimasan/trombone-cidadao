import { useEffect, useRef } from 'react';

import { useTheme } from '@/design-system/theme/ThemeProvider';
import { haversine } from '@/lib/navGeo';
import { prefetchAoRedor, DESLOCAMENTO_PREFETCH_M } from '@/lib/tileCache';

// Baixa o mapa do caminho enquanto ainda há sinal.
//
// POR QUE DURANTE A PATRULHA, E NÃO NA HORA DE REGISTRAR
//
// Na hora de registrar já é tarde: a pessoa parou justamente onde o problema
// está, que é onde a rede falta. O único momento em que dá para garantir os
// tiles é antes — enquanto o carro anda e a conexão vai e volta.
//
// O CUSTO
//
// Um lote de 27 tiles a cada 100 m percorridos, e só o que ainda não está
// guardado. Numa patrulha de 5 km isso dá algo perto de 3 MB na primeira vez
// pelo trajeto e quase nada nas seguintes, porque as grades se sobrepõem. Roda
// em série e nunca em paralelo consigo mesmo: o envio de foto e a busca do
// corredor têm prioridade sobre um download que ninguém está esperando.

export function usePatrolTilePrefetch(posicao, { ativo = true } = {}) {
  const { resolved } = useTheme();
  const ultimoRef = useRef(null);
  const rodandoRef = useRef(false);

  useEffect(() => {
    if (!ativo || !posicao) return;
    if (rodandoRef.current) return;
    // `onLine === false` é a única resposta confiável da API: `true` não
    // promete rede, mas `false` promete a ausência dela. Nesse caso o lote
    // falharia inteiro no primeiro tile.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const ultimo = ultimoRef.current;
    if (ultimo && haversine(ultimo, posicao) < DESLOCAMENTO_PREFETCH_M) return;

    // Marca ANTES de baixar: o GPS entrega uma leitura por segundo e o lote
    // leva mais que isso. Sem a marca, dez leituras disparariam dez lotes do
    // mesmo lugar.
    ultimoRef.current = { lat: posicao.lat, lng: posicao.lng };
    rodandoRef.current = true;

    prefetchAoRedor({ lat: posicao.lat, lng: posicao.lng }, { tema: resolved })
      .catch(() => {})
      .finally(() => { rodandoRef.current = false; });
  }, [posicao, ativo, resolved]);
}

export default usePatrolTilePrefetch;
