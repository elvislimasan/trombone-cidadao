import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { haversine } from '@/lib/navGeo';

// Nome da rua atual para o painel.
//
// Passa pela edge function `reverse-geocode` em vez de chamar o Nominatim
// direto: a política de uso dele proíbe consulta contínua, e o modo navegação é
// exatamente isso. A função já roda com User-Agent próprio e é o caminho que o
// resto do app usa.
//
// Mesmo assim há dois freios, porque o custo real é do Nominatim:
//   • no máximo uma consulta a cada INTERVALO_MS;
//   • e só depois de andar DISTANCIA_MIN_M — parado num sinal a rua não muda.

const INTERVALO_MS = 20000;
const DISTANCIA_MIN_M = 120;

export function useNavStreet(posicao) {
  const [rua, setRua] = useState(null);

  const ultimaConsultaRef = useRef({ em: 0, ponto: null });
  const emVooRef = useRef(false);

  useEffect(() => {
    if (!posicao) return;

    const { em, ponto } = ultimaConsultaRef.current;
    const agora = Date.now();
    const cedoDemais = agora - em < INTERVALO_MS;
    const pertoDemais = ponto && haversine(ponto, posicao) < DISTANCIA_MIN_M;
    if (emVooRef.current || (ponto && (cedoDemais || pertoDemais))) return;

    emVooRef.current = true;
    ultimaConsultaRef.current = { em: agora, ponto: { lat: posicao.lat, lng: posicao.lng } };

    supabase.functions
      .invoke('reverse-geocode', {
        body: { lat: posicao.lat, lng: posicao.lng, zoom: 17 },
      })
      .then(({ data, error }) => {
        if (error || !data) return;
        // `raw.address.road` é o nome da via isolado; `address` traz a linha
        // completa com bairro e cidade, longa demais para o painel.
        const via = String(data?.raw?.address?.road ?? '').trim();
        const bairro = String(data?.suburb ?? '').trim();
        setRua(via || bairro || data?.city || null);
      })
      .catch(() => {})
      .finally(() => { emVooRef.current = false; });
  }, [posicao]);

  return rua;
}
