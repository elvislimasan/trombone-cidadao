import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { caixaDeRaio, haversine } from '@/lib/navGeo';
import { guardarReserva, lerReserva } from '@/lib/corridorCache';

// Broncas do corredor por onde o usuário está passando.
//
// A MapPage busca por bounds a cada moveend com 300ms de debounce. Isso serve
// para quem arrasta o mapa, mas dirigindo o mapa se move o tempo todo: seria
// uma RPC por segundo, para sempre. Aqui a estratégia se inverte —
//
//   busca UMA vez um quadrado de RAIO_M em volta do usuário e só refaz quando
//   ele se afasta REFETCH_M do centro daquele fetch.
//
// A 60 km/h isso dá um request por minuto em vez de ~60, e a detecção de alerta
// roda sobre o cache local: latência zero no instante que importa, e continua
// funcionando em túnel ou área sem sinal.
//
// `zoom: 18` importa: a partir de 13 a RPC devolve pins individuais com status
// e coordenadas, sem agregação (migração 171). Não há RPC nova nem migração.

const RAIO_M = 2000;

/**
 * Raio da RESERVA, buscada uma vez no começo da saída.
 *
 * 8 km cobre uma patrulha inteira numa cidade do porte de Floresta e boa parte
 * de um bairro numa capital. Maior que isso começa a trazer bronca que a pessoa
 * nunca vai chegar perto, e a consulta pesa no primeiro segundo da tela — que é
 * justamente quando ela está esperando o mapa aparecer.
 */
const RAIO_RESERVA_M = 8000;
const REFETCH_M = 1000;

/**
 * Bronca atualizada nos últimos dias sai do corredor.
 *
 * Alertar sobre um buraco que alguém confirmou anteontem é pedir o mesmo
 * trabalho duas vezes — e o segundo relato não acrescenta nada ao processo,
 * porque a informação já está lá, recente. Pior: gasta o único recurso escasso
 * do modo, que é a atenção de quem está dirigindo.
 *
 * Dois dias é curto de propósito. A janela existe para evitar repetição, não
 * para esconder a bronca: no terceiro dia ela volta a alertar, porque aí já faz
 * diferença saber se continua lá.
 */
const DIAS_SEM_REALERTAR = 2;

export function useNavCorridor(posicao, { categoria = null } = {}) {
  const [broncas, setBroncas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erroRede, setErroRede] = useState(false);
  // Os alertas estão saindo do que foi guardado, não do servidor.
  const [deReserva, setDeReserva] = useState(false);

  const centroRef = useRef(null);
  const emVooRef = useRef(false);
  // Contador de requisições: descarta resposta de um fetch antigo que chegou
  // depois de um mais novo, senão o cache volta para um trecho já percorrido.
  const seqRef = useRef(0);
  // A reserva e baixada uma vez por saida.
  const reservaRef = useRef(false);

  const buscar = useCallback(async (centro) => {
    if (emVooRef.current) return;
    emVooRef.current = true;
    const seq = ++seqRef.current;
    setCarregando(true);
    try {
      const caixa = caixaDeRaio(centro, RAIO_M);
      const { data, error } = await supabase.rpc('reports_map_clusters', {
        min_lat: caixa.minLat,
        max_lat: caixa.maxLat,
        min_lng: caixa.minLng,
        max_lng: caixa.maxLng,
        zoom: 18,
        status_filter: 'active',
        category_filter: categoria,
      });
      if (error) throw error;
      if (seq !== seqRef.current) return;

      const doCorredor = (data || [])
        .filter((row) => !row.is_cluster && row.report);

      // Uma consulta a cada corredor — ou seja, uma por quilômetro, não uma por
      // leitura de GPS. Se ela falhar, `recentes` fica vazio e o corredor vem
      // inteiro: alertar demais é falha melhor que perder a bronca.
      let recentes = new Set();
      if (doCorredor.length > 0) {
        const { data: atualizadas } = await supabase.rpc('reports_updated_recently', {
          p_ids: doCorredor.map((row) => row.report.id),
          p_dias: DIAS_SEM_REALERTAR,
        });
        recentes = new Set((atualizadas || []).map((r) => r.report_id));
      }
      if (seq !== seqRef.current) return;

      setBroncas(
        doCorredor
          .filter((row) => !recentes.has(row.report.id))
          .map((row) => ({
            id: row.report.id,
            title: row.report.title,
            status: row.report.status,
            category: row.report.category_id,
            categoryName: row.report.category_name || row.report.category_id,
            coverImage: row.report.cover_image,
            author_id: row.report.author_id ?? null,
            lat: row.report.lat,
            lng: row.report.lng,
          }))
      );
      centroRef.current = centro;
      setErroRede(false);
      setDeReserva(false);
    } catch (err) {
      console.error('[useNavCorridor] falha ao buscar corredor:', err);
      // Mantém o cache anterior de propósito: perder sinal no meio do trajeto
      // não deve apagar as broncas que já sabemos estar à frente.
      setErroRede(true);

      // E vai buscar na reserva o que existe À FRENTE, não só o que sobrou do
      // último trecho com sinal. É a diferença entre alertar por mais dois
      // quarteirões e alertar pelo resto da saída.
      const reserva = await lerReserva(categoria);
      if (reserva?.broncas?.length) {
        const caixa = caixaDeRaio(centro, RAIO_M);
        const perto = reserva.broncas.filter(
          (b) =>
            b.lat >= caixa.minLat && b.lat <= caixa.maxLat &&
            b.lng >= caixa.minLng && b.lng <= caixa.maxLng
        );
        if (perto.length > 0) {
          setBroncas(perto);
          setDeReserva(true);
          // O centro NÃO é marcado: assim que a rede voltar, o próximo passo
          // refaz a busca de verdade em vez de esperar mais um quilômetro.
        }
      }
    } finally {
      emVooRef.current = false;
      setCarregando(false);
    }
  }, [categoria]);

  /**
   * Baixa a reserva: um raio grande, uma vez só, no começo da saída.
   *
   * POR QUE NO COMEÇO E NÃO SOB DEMANDA
   *
   * Porque quando a rede cai já é tarde. A reserva só serve se tiver sido
   * baixada ENQUANTO havia sinal — e o momento em que isso é mais provável é o
   * primeiro, quando a pessoa ainda está saindo de casa ou do trabalho.
   *
   * Falhar aqui não impede nada: a patrulha começa normal e o corredor comum
   * segue funcionando. O que se perde é a rede de segurança.
   */
  const precarregar = useCallback(async (centro) => {
    if (!centro || reservaRef.current) return;
    reservaRef.current = true;
    try {
      const caixa = caixaDeRaio(centro, RAIO_RESERVA_M);
      const { data, error } = await supabase.rpc('reports_map_clusters', {
        min_lat: caixa.minLat,
        max_lat: caixa.maxLat,
        min_lng: caixa.minLng,
        max_lng: caixa.maxLng,
        zoom: 18,
        status_filter: 'active',
        category_filter: categoria,
      });
      if (error) throw error;

      const lista = (data || [])
        .filter((row) => !row.is_cluster && row.report)
        .map((row) => ({
          id: row.report.id,
          title: row.report.title,
          status: row.report.status,
          category: row.report.category_id,
          categoryName: row.report.category_name || row.report.category_id,
          coverImage: row.report.cover_image,
          author_id: row.report.author_id ?? null,
          lat: row.report.lat,
          lng: row.report.lng,
        }));

      await guardarReserva(categoria, lista, centro);
    } catch (err) {
      console.error('[useNavCorridor] reserva nao foi baixada:', err);
      // Deixa tentar de novo no proximo trecho: sem isto, uma queda no primeiro
      // segundo da patrulha condenaria a saida inteira a ficar sem reserva.
      reservaRef.current = false;
    }
  }, [categoria]);

  useEffect(() => {
    if (!posicao) return;
    precarregar({ lat: posicao.lat, lng: posicao.lng });
    const centro = centroRef.current;
    if (!centro || haversine(centro, posicao) > REFETCH_M) {
      buscar({ lat: posicao.lat, lng: posicao.lng });
    }
  }, [posicao, buscar, precarregar]);

  // Troca de categoria invalida o cache: o filtro é aplicado no servidor.
  useEffect(() => {
    centroRef.current = null;
    reservaRef.current = false;
  }, [categoria]);

  /** Remove uma bronca do cache após confirmação, para não realertar. */
  const descartar = useCallback((id) => {
    setBroncas((atual) => atual.filter((b) => b.id !== id));
  }, []);

  return { broncas, carregando, erroRede, deReserva, precarregar, descartar };
}
