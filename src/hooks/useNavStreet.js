import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { haversine } from '@/lib/navGeo';

// Rua, bairro e cidade atuais.
//
// Passa pela edge function `reverse-geocode` em vez de chamar o Nominatim
// direto: a política de uso dele proíbe consulta contínua, e o modo navegação é
// exatamente isso. A função já roda com User-Agent próprio e é o caminho que o
// resto do app usa.
//
// Mesmo assim há dois freios, porque o custo real é do Nominatim:
//   • no máximo uma consulta a cada INTERVALO_MS;
//   • e só depois de andar DISTANCIA_MIN_M — parado num sinal a rua não muda.
//
// O bairro sai da MESMA resposta que já era pedida para o painel. Ele é o que
// os títulos e as medalhas de bairro usam, e uma segunda chamada só para
// obtê-lo dobraria o tráfego contra um serviço que pede moderação — para
// receber, palavra por palavra, o campo que esta resposta já traz.
//
// A CIDADE VEM DAQUI, NÃO DO FILTRO DO MAPA
//
// Toda bronca criada em patrulha nasce onde a pessoa está de pé. Antes o
// `city_id` dessas linhas vinha do seletor de cidade do mapa, que é um FILTRO
// de visualização: fica nulo enquanto ninguém escolhe cidade, e em patrulha
// nem é reavaliado (o mapa ignora mudança de área nesse modo). Resultado:
// sinal e bronca gravados com city_id nulo, invisíveis para o embaixador da
// cidade — cuja RLS é `is_ambassador_of(uid, city_id)` — e fora de todo placar.
//
// A resposta que já traz rua e bairro traz cidade e UF. Resolver o id aqui
// custa uma RPC por cidade nova, e amarra o dado ao lugar certo: o chão.

const INTERVALO_MS = 20000;
const DISTANCIA_MIN_M = 120;

/** `match_city` devolve bigint, que o PostgREST pode entregar como string. */
const parseCityId = (raw) => {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function useNavStreet(posicao) {
  const [lugar, setLugar] = useState({ rua: null, bairro: null, cidadeId: null });

  const ultimaConsultaRef = useRef({ em: 0, ponto: null });
  const emVooRef = useRef(false);
  // Nome+UF já resolvidos. Dirigindo dentro do mesmo município, o par não muda
  // por horas — sem o cache seria uma RPC a cada resposta do reverse-geocode.
  const cidadesRef = useRef(new Map());

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
      .then(async ({ data, error }) => {
        if (error || !data) return;
        // `raw.address.road` é o nome da via isolado; `address` traz a linha
        // completa com bairro e cidade, longa demais para o painel.
        const via = String(data?.raw?.address?.road ?? '').trim();
        const bairro = String(data?.suburb ?? '').trim();

        const cidade = String(data?.city ?? '').trim();
        const uf = String(data?.state_uf ?? '').trim();
        let cidadeId = null;
        if (cidade && uf) {
          const chave = `${cidade}|${uf}`;
          if (cidadesRef.current.has(chave)) {
            cidadeId = cidadesRef.current.get(chave);
          } else {
            const { data: bruto } = await supabase.rpc('match_city', {
              p_name: cidade,
              p_uf: uf,
            });
            cidadeId = parseCityId(bruto);
            // Guarda inclusive o nulo: uma cidade que o banco não conhece não
            // vai passar a conhecer no próximo quarteirão, e repetir a RPC a
            // cada 20 s pelo resto do trajeto não descobriria nada.
            cidadesRef.current.set(chave, cidadeId);
          }
        }

        setLugar((atual) => ({
          rua: via || bairro || data?.city || null,
          // Só o bairro de verdade. O `rua` acima aceita cair para bairro ou
          // cidade quando a via não vem, porque o painel precisa mostrar algo;
          // aqui esse remendo seria mentira gravada no banco — uma ação
          // marcada com o nome da cidade no lugar do bairro entraria no placar
          // errado, e ninguém teria como saber depois.
          bairro: bairro || null,
          // Mantém a última cidade conhecida quando esta resposta não resolveu.
          // Perder o id num geocode ruim faria a próxima bronca nascer sem
          // cidade — exatamente o buraco que este hook existe para fechar.
          cidadeId: cidadeId ?? atual.cidadeId,
        }));
      })
      .catch(() => {})
      .finally(() => { emVooRef.current = false; });
  }, [posicao]);

  return lugar;
}
