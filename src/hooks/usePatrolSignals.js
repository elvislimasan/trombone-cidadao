import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { haversine } from '@/lib/navGeo';
import { nomeDaCategoria } from '@/lib/reportCategories';
import { camposParaColunas } from '@/lib/reportCategoryFields';

// Sinais e missões do modo patrulha.
//
// Sinalizar é criar uma bronca incompleta: categoria e ponto, sem foto e sem
// descrição. Ela não entra no feed — nasce fora do filtro de moderação que
// todas as consultas públicas aplicam — e fica visível como MISSÃO para quem
// estiver logado, até que alguém vá ao local e complete o cadastro.
//
// A REGRA DOS 100 METROS É DO SERVIDOR
//
// `podeAgir` existe só para desabilitar o botão antes do toque, poupando o
// usuário de uma viagem à rede para ouvir não. Quem decide é a RPC, que mede a
// distância no banco: a checagem daqui roda em JavaScript que qualquer um edita,
// e a coordenada enviada é texto no corpo da requisição. Nunca troque uma pela
// outra.

/**
 * Até onde o servidor aceita a ação. Espelha `patrol_signal_presence_m()` na
 * migração 173 — mudar aqui sem mudar lá faz o botão prometer o que a RPC nega.
 */
export const RAIO_PRESENCA_M = 100;

/**
 * Até onde o card da missão APARECE sozinho.
 *
 * Separado do raio de ação de propósito, e a diferença não é detalhe:
 *
 *   • 100 m é "o servidor deixa registrar daqui" — é permissão;
 *   • 15 m é "você está em cima do problema" — é o momento de perguntar.
 *
 * Com um número só, o card pulava na tela a um quarteirão de distância, sobre
 * um poste que a pessoa ainda não enxergava, e ficava lá enquanto ela dirigia.
 * O mesmo raio do alerta de bronca (NAV_ALERTA.distanciaAlertaM), pela mesma
 * razão: perguntar sobre o que não está à vista convida ao palpite.
 *
 * Longe disso a missão continua existindo — o pin está no mapa, e tocar nele
 * traça a rota e abre o registro. O que muda é que ela deixa de INTERROMPER.
 */
export const RAIO_CARD_MISSAO_M = 15;

/**
 * Até onde a barra da missão escolhida oferece "Registrar".
 *
 * TRÊS RAIOS, TRÊS PERGUNTAS DIFERENTES
 *
 *   • 100 m — o servidor aceita. É permissão, e é a única que protege o dado.
 *   •  20 m — o botão aparece na barra. É "você chegou".
 *   •  15 m — o card completo interrompe sozinho. É "você está em cima".
 *
 * O botão nascia com o raio do servidor, e por isso aparecia a um quarteirão
 * de distância: a barra dizia "a 55 m daqui" com um Registrar aceso ao lado,
 * convidando a cadastrar de longe uma bronca que a pessoa não estava vendo.
 * Foto tirada de 55 m é foto de outra coisa.
 *
 * Mais apertado que o servidor de propósito. O contrário — cliente mais
 * frouxo — é o que faz o botão prometer o que a RPC nega.
 */
export const RAIO_REGISTRO_M = 20;

/**
 * Quanto o ponto de uma missão pode ser corrigido. Espelha
 * `patrol_signal_adjust_m()` na migração 175.
 *
 * A sinalização acontece em movimento e cai aproximada — quem passa de carro
 * marca a esquina, não o buraco. Quem chega a pé vê o problema e pode acertar o
 * pin, desde que a correção fique perto da marcação original E perto de onde a
 * pessoa está. O limite é o que separa corrigir de reapontar para outro lugar.
 */
export const RAIO_AJUSTE_M = 100;

// Mesma estratégia do useNavCorridor: busca um raio generoso de uma vez e só
// refaz quando o usuário se afasta do centro daquele fetch. Dirigindo, o
// alternativo seria uma consulta por segundo.
const RAIO_BUSCA_M = 2000;
const REFETCH_M = 1000;

export function usePatrolSignals(
  posicao,
  { cityId = null, bairro = null, rua = null, categoria = null } = {}
) {
  const { user } = useAuth();

  const [missoes, setMissoes] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const centroRef = useRef(null);
  const emVooRef = useRef(false);
  const seqRef = useRef(0);

  // O bairro chega do reverse-geocode, que responde a cada ~20 s. Guardar em ref
  // o último valor conhecido evita que um sinal criado no intervalo entre duas
  // respostas nasça sem bairro só por causa do tempo da consulta.
  const bairroRef = useRef(null);
  useEffect(() => { if (bairro) bairroRef.current = bairro; }, [bairro]);

  // A rua vai junto do sinal: quem cumpre a missão precisa CHEGAR ali, e um
  // nome de rua diz mais que um pino para quem decide se vale o desvio.
  const ruaRef = useRef(null);
  useEffect(() => { if (rua) ruaRef.current = rua; }, [rua]);

  const buscar = useCallback(async (centro) => {
    if (emVooRef.current) return;
    emVooRef.current = true;
    const seq = ++seqRef.current;
    try {
      const { data, error } = await supabase.rpc('patrol_missions_nearby', {
        p_lat: centro.lat,
        p_lng: centro.lng,
        p_radius_m: RAIO_BUSCA_M,
        p_limit: 50,
      });
      if (error) throw error;
      if (seq !== seqRef.current) return;

      setMissoes(
        (data || []).map((m) => ({
          id: m.id,
          lat: m.lat,
          lng: m.lng,
          category: m.category_id,
          categoryName: m.category_name || m.category_id,
          bairro: m.neighborhood,
          criadaEm: m.created_at,
          autorId: m.signaled_by,
          autorNome: m.signaled_by_name,
          // Marca as missões que a interface deve tratar como "de outra
          // pessoa" — o card muda de texto, não de permissão: quem sinalizou
          // pode voltar e completar o próprio sinal.
          minha: Boolean(user && m.signaled_by === user.id),
        }))
      );
      centroRef.current = centro;
    } catch (err) {
      console.error('[usePatrolSignals] falha ao buscar missões:', err);
      // Mantém o cache: perder sinal no meio do trajeto não deve apagar as
      // missões que já sabemos estar à frente.
    } finally {
      emVooRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!posicao || !user) return;
    const centro = centroRef.current;
    if (!centro || haversine(centro, posicao) > REFETCH_M) {
      buscar({ lat: posicao.lat, lng: posicao.lng });
    }
  }, [posicao, user, buscar]);

  /** Distância até a missão, em metros. `null` sem posição. */
  const distanciaAte = useCallback(
    (missao) => (posicao && missao ? haversine(posicao, missao) : null),
    [posicao]
  );

  /** O botão de agir sobre esta missão deve estar habilitado? */
  const podeAgir = useCallback(
    (missao) => {
      const d = distanciaAte(missao);
      return d !== null && d <= RAIO_PRESENCA_M;
    },
    [distanciaAte]
  );

  /**
   * Cria o sinal na posição atual.
   *
   * @returns {Promise<{ok:boolean, id?:string, duplicado?:boolean, error?:Error}>}
   *          `duplicado` significa que já existe missão aberta da mesma
   *          categoria a menos de 30 m — não é erro, é a resposta certa para
   *          quem tentou marcar o mesmo buraco duas vezes.
   */
  const sinalizar = useCallback(async (categoryId) => {
    if (!user) return { ok: false, error: new Error('sem usuário') };
    if (!posicao) return { ok: false, error: new Error('sem posição') };

    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc('create_patrol_signal', {
        p_lat: posicao.lat,
        p_lng: posicao.lng,
        p_category_id: categoryId,
        p_city_id: cityId ? Number(cityId) : null,
        p_neighborhood: bairroRef.current,
        p_address: ruaRef.current,
      });
      if (error) throw error;

      const linha = data?.[0];
      if (linha?.duplicado) {
        return { ok: false, duplicado: true, id: linha.existente_id };
      }

      // Entra na lista local na hora: o pin aparece no mapa antes do próximo
      // fetch, que só acontece a um quilômetro daqui.
      if (linha?.id) {
        setMissoes((atual) => [
          {
            id: linha.id,
            lat: posicao.lat,
            lng: posicao.lng,
            category: categoryId,
            // O nome vem da lista local: a RPC de busca só devolveria o rótulo
            // no próximo fetch, a um quilômetro daqui, e até lá o card diria
            // 'buracos' em vez de 'Buracos na Via'.
            categoryName: nomeDaCategoria(categoryId),
            bairro: bairroRef.current,
            criadaEm: new Date().toISOString(),
            autorId: user.id,
            autorNome: null,
            minha: true,
          },
          ...atual,
        ]);
      }
      return { ok: true, id: linha?.id };
    } catch (err) {
      console.error('[usePatrolSignals] falha ao sinalizar:', err);
      // O motivo REAL sobe junto. Antes a tela mostrava "tente de novo em
      // instantes" para qualquer falha — inclusive para as que nenhuma
      // tentativa resolveria — e não havia como saber o que tinha quebrado sem
      // abrir o console de um celular.
      return { ok: false, error: err, motivo: explicar(err) };
    } finally {
      setEnviando(false);
    }
  }, [user, posicao, cityId]);

  /**
   * Traduz o erro da RPC para o que o usuário precisa ler.
   *
   * As funções do banco levantam com códigos próprios; sem esta tradução a
   * tela mostraria "fora do local" cru, ou pior, a mensagem do Postgres.
   */
  const explicar = (err) => {
    const texto = String(err?.message || '');
    if (texto.includes('fora do local')) {
      return `Você precisa estar a menos de ${RAIO_PRESENCA_M} m do ponto.`;
    }
    if (texto.includes('missao indisponivel')) {
      return 'Esta missão já foi atendida por outra pessoa.';
    }
    // Mantida para bancos onde a 191 ainda não rodou: sem ela, a pessoa
    // receberia o texto cru do Postgres em vez de uma frase.
    if (texto.includes('autor nao cumpre')) {
      return 'Este servidor ainda não permite registrar a própria sinalização. Falta aplicar uma migração.';
    }
    if (texto.includes('ajuste longe da marcacao')) {
      return `O ponto corrigido precisa ficar a menos de ${RAIO_AJUSTE_M} m da marcação original.`;
    }
    if (texto.includes('ajuste longe de voce')) {
      return `Aproxime-se do ponto que você marcou: ele está a mais de ${RAIO_AJUSTE_M} m de você.`;
    }
    if (texto.includes('tipo do problema obrigatorio')) {
      return 'Selecione o tipo do problema de iluminação.';
    }
    if (texto.includes('plaqueta obrigatoria')) {
      return 'Informe o número da plaqueta do poste.';
    }
    if (texto.includes('sem sessao')) return 'Entre na sua conta para continuar.';

    // O app chamou uma função que o banco não tem — quase sempre uma migração
    // que ainda não foi aplicada. O PostgREST devolve isso como PGRST202 e o
    // texto cita o cache de esquema.
    if (err?.code === 'PGRST202' || texto.includes('schema cache')) {
      return 'O app pediu algo que o banco ainda não tem. Falta aplicar uma migração.';
    }

    // Sem tradução conhecida, mostra o que o servidor disse.
    //
    // O texto de reserva era "Não foi possível concluir agora" — que não ajuda
    // ninguém: nem quem usa, que não sabe o que fazer, nem quem conserta, que
    // recebe um relato sem informação nenhuma. Uma mensagem crua é feia e é
    // melhor que isso.
    return texto || 'Não foi possível concluir agora.';
  };

  /**
   * Completa a missão: a bronca passa a ter título, descrição e dono do laudo.
   *
   * `novoPonto` corrige a coordenada quando a sinalização caiu aproximada. É
   * opcional — sem ele o ponto original permanece —, e o servidor confere os
   * limites de novo: aqui o mapa apenas impede o arrasto de sair da área.
   */
  const cumprir = useCallback(async (missaoId, { titulo, descricao, novoPonto, extras }) => {
    if (!posicao) return { ok: false, error: new Error('sem posição') };
    setEnviando(true);
    try {
      const { error } = await supabase.rpc('complete_patrol_signal', {
        p_signal_id: missaoId,
        p_title: titulo,
        p_description: descricao ?? null,
        p_lat: posicao.lat,
        p_lng: posicao.lng,
        p_new_lat: novoPonto?.lat ?? null,
        p_new_lng: novoPonto?.lng ?? null,
        // Tapa o buraco de um sinal que nasceu sem cidade ou sem bairro — por
        // ter sido marcado antes do primeiro reverse-geocode responder, ou por
        // versão antiga do app. A RPC só PREENCHE o que está nulo: quem cumpre
        // a missão não reescreve o que quem sinalizou já acertou (migração 176).
        p_city_id: cityId ? Number(cityId) : null,
        p_neighborhood: bairroRef.current,
        // Campos da categoria (migração 177). A RPC cobra os obrigatórios de
        // novo — ela é security definer e escreve na linha de outro usuário,
        // então não pode confiar na validação da tela.
        p_issue_type: extras?.issue_type ?? null,
        p_pole_number: extras?.pole_number ?? null,
        p_is_from_water_utility: extras?.is_from_water_utility ?? null,
      });
      if (error) throw error;
      setMissoes((atual) => atual.filter((m) => m.id !== missaoId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err, motivo: explicar(err) };
    } finally {
      setEnviando(false);
    }
  }, [posicao, cityId]);

  /** "Nada aqui": encerra a missão e o sinal deixa de pontuar. */
  const descartar = useCallback(async (missaoId) => {
    if (!posicao) return { ok: false, error: new Error('sem posição') };
    setEnviando(true);
    try {
      const { error } = await supabase.rpc('mark_patrol_signal_empty', {
        p_signal_id: missaoId,
        p_lat: posicao.lat,
        p_lng: posicao.lng,
      });
      if (error) throw error;
      setMissoes((atual) => atual.filter((m) => m.id !== missaoId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err, motivo: explicar(err) };
    } finally {
      setEnviando(false);
    }
  }, [posicao]);

  /**
   * A missão mais próxima que já está ao alcance da mão.
   *
   * As próprias ficam de fora: sinalizar é apontar, cumprir é provar, e quando
   * a mesma pessoa faz os dois não há prova nenhuma. O sinal continua no mapa
   * como pino — para quem marcou saber que marcou — mas sem o card de ação.
   *
   * O servidor recusa igual (migração 175). Esta linha existe para o botão não
   * aparecer e frustrar, não para garantir a regra.
   */
  const missaoAoAlcance = useMemo(() => {
    if (!posicao) return null;
    return (
      // NÃO HÁ MAIS FILTRO DE `minha` AQUI.
      //
      // O próprio sinal era escondido porque o servidor recusava que o autor o
      // cumprisse. Desde a 191 não recusa mais: marcar de passagem e voltar
      // depois com a foto é o caminho normal, não um atalho — o equilíbrio
      // passou a vir da contagem (fazer os dois rende os mesmos 10 de um
      // cadastro direto).
      //
      // Esconder o próprio ponto era, na prática, escondê-lo de quem tinha mais
      // chance de resolvê-lo: quem sabia que ele estava lá.
      missoes
        // A categoria peneira ANTES da ordenação por distância, e a ordem
        // importa: filtrando depois, um poste sinalizado a 40 m venceria a
        // escolha do mais próximo e seria descartado em seguida — levando
        // junto o buraco a 80 m, que era a missão certa para esta patrulha.
        .filter((m) => !categoria || m.category === categoria)
        .map((m) => ({ ...m, distancia: haversine(posicao, m) }))
        .filter((m) => m.distancia <= RAIO_CARD_MISSAO_M)
        .sort((a, b) => a.distancia - b.distancia)[0] || null
    );
  }, [missoes, posicao, categoria]);

  /**
   * Cadastro completo direto, sem passar por sinal.
   *
   * É o outro caminho oferecido ao tocar em Sinalizar: quem tem tempo de parar
   * e fotografar cria a bronca inteira aqui, e ela vale mais que o sinal.
   *
   * Não é sinal + conclusão pelo mesmo usuário: além de o servidor recusar isso
   * desde a 175, a soma pagaria 15 pontos pelo que um cadastro normal paga 10.
   * Aqui a linha nasce `origin='full'`, idêntica a uma bronca criada pelo
   * formulário comum — mesmo fluxo de moderação, mesma pontuação.
   *
   * QUANDO A CIDADE NAO RESOLVE
   *
   * `cityId` vem do GPS (useNavStreet) e pode estar nulo nos primeiros segundos
   * de patrulha, antes do primeiro reverse-geocode. Aqui NAO se bloqueia por
   * isso — diferente do ReportModal, onde o marcador esta parado e tentar de
   * novo custa um toque. Quem esta na rua, de pe, com a foto tirada, nao pode
   * ouvir "nao deu para identificar a cidade": o registro se perde junto com a
   * ida ate o local. A bronca entra na fila de moderacao sem cidade e o
   * moderador a completa antes de aprovar.
   *
   * @returns {Promise<{ok:boolean, id?:string, error?:Error}>}
   */
  const criarBroncaCompleta = useCallback(async ({ categoryId, titulo, descricao, ponto, extras }) => {
    if (!user) return { ok: false, error: new Error('sem usuário') };
    if (!posicao) return { ok: false, error: new Error('sem posição') };

    setEnviando(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .insert({
          title: titulo?.trim() || nomeDaCategoria(categoryId),
          description: descricao?.trim() || null,
          category_id: categoryId,
          // Colunas da categoria (tipo do problema, plaqueta, obra de água).
          // Todas vêm sempre, com null onde não se aplicam — mesma forma que o
          // useCreateReport monta. Divergir faria a mesma bronca aparecer
          // identificada numa tela e sem identificação em outra.
          ...camposParaColunas(categoryId, extras),
          // O ponto pode ter sido corrigido no mapa do modal. Sem correção,
          // é a posição do GPS — que é onde a pessoa está de pé.
          location: `POINT(${(ponto ?? posicao).lng} ${(ponto ?? posicao).lat})`,
          author_id: user.id,
          protocol: `TROMB-${Date.now()}`,
          status: 'pending',
          moderation_status:
            user?.is_admin || user?.is_master ? 'approved' : 'pending_approval',
          city_id: cityId ? Number(cityId) : null,
          neighborhood: bairroRef.current,
          // A rua vai junto, pelo mesmo motivo do `sinalizar`: sem ela a bronca
          // nasce com `address` nulo e a página de detalhe some com o endereço
          // — o card de Localização fica só com o mapa, e o resumo, só com o
          // título. É a mesma ref que o sinal usa, então os dois caminhos de
          // criação gravam a mesma coisa no mesmo lugar.
          address: ruaRef.current,
          is_anonymous: false,
        })
        .select('id')
        .single();

      if (error) throw error;
      return { ok: true, id: data.id };
    } catch (err) {
      console.error('[usePatrolSignals] falha ao criar bronca:', err);
      return { ok: false, error: err, motivo: explicar(err) };
    } finally {
      setEnviando(false);
    }
  }, [user, posicao, cityId]);

  return {
    missoes,
    missaoAoAlcance,
    enviando,
    sinalizar,
    cumprir,
    descartar,
    criarBroncaCompleta,
    podeAgir,
    distanciaAte,
  };
}
