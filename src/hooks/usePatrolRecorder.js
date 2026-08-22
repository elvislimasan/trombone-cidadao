import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { deveRegistrarPonto, distanciaTotal, rastroParaBanco } from '@/lib/navGeo';

// Grava a sessão de patrulha: rastro na tela, distância, tempo e o que foi
// patrulhado.
//
// O rastro vive só aqui, em memória, e some ao encerrar. Ele serve para o
// usuário ver por onde já passou e não repetir rua — não é registro histórico.
// Gravar a rota levaria junto o ponto de partida, que costuma ser a casa da
// pessoa; a tabela `patrols` guarda apenas números e a cidade.

export function usePatrolRecorder(posicao, { cityId = null } = {}) {
  const { user } = useAuth();

  const [rastro, setRastro] = useState([]);
  const [contagens, setContagens] = useState({
    passadas: 0,
    confirmadas: 0,
    registradas: 0,
    sinalizadas: 0,
  });
  const [salvando, setSalvando] = useState(false);

  const inicioRef = useRef(null);
  // Sets em ref, não em estado: entram por callback durante o trajeto e só o
  // total precisa re-renderizar. Set também dá a idempotência de graça — passar
  // duas vezes pela mesma bronca conta uma.
  const passadasRef = useRef(new Set());
  const confirmadasRef = useRef(new Set());
  // O que a patrulha PRODUZIU, não por onde ela passou. Estes dois viviam só na
  // contagem da tela e morriam com ela; agora vão para a linha gravada, e é o
  // que permite refazer o card de story a partir do histórico.
  const registradasRef = useRef(new Set());
  const sinalizadasRef = useRef(new Set());
  // Onde a pessoa ESTAVA a cada ação, para desenhar os pontos no traçado.
  //
  // Não dá para deduzir isso depois a partir dos ids: a coordenada da bronca é
  // do problema, não de quem registrou, e uma bronca rejeitada some da consulta
  // — o ponto do trajeto desapareceria meses depois, sem aviso. Ver a 189.
  const acoesRef = useRef([]);
  // Impede duas linhas para a mesma patrulha quando o usuário toca em concluir
  // e compartilhar, ou toca duas vezes.
  const salvaRef = useRef(null);
  // A última posição conhecida, legível de dentro dos callbacks sem que eles
  // precisem depender de `posicao` e trocar de identidade a cada leitura de GPS.
  const posicaoRef = useRef(null);

  const sincronizarContagens = useCallback(() => {
    setContagens({
      passadas: passadasRef.current.size,
      confirmadas: confirmadasRef.current.size,
      registradas: registradasRef.current.size,
      sinalizadas: sinalizadasRef.current.size,
    });
  }, []);

  useEffect(() => {
    if (!posicao) return;
    posicaoRef.current = { lat: posicao.lat, lng: posicao.lng };
    if (!inicioRef.current) inicioRef.current = Date.now();

    setRastro((atual) => {
      const ultimo = atual[atual.length - 1];
      // O rastro só avança com movimento CONFIRMADO. Antes bastava a leitura
      // estar a 5 m da anterior, e parado o GPS entrega isso sozinho: a
      // patrulha somava quilômetros com o usuário sentado. Quem decide é
      // estimarMovimento, a mesma função que libera os alertas.
      if (!deveRegistrarPonto(ultimo, posicao, { emMovimento: posicao.emMovimento })) {
        return atual;
      }
      return [...atual, { lat: posicao.lat, lng: posicao.lng }];
    });
  }, [posicao]);

  const distanciaM = useMemo(() => distanciaTotal(rastro), [rastro]);

  /**
   * Guarda o ponto do trajeto onde a ação aconteceu.
   *
   * Sem GPS ainda não há ponto — e não inventar um é melhor que carimbar a
   * ação em (0, 0), que jogaria o enquadramento do traçado no golfo da Guiné.
   */
  const marcarAcao = useCallback((tipo) => {
    const p = posicaoRef.current;
    if (!p) return;
    acoesRef.current.push({ lng: p.lng, lat: p.lat, t: tipo });
  }, []);

  const registrarPassagem = useCallback((id) => {
    if (!id || passadasRef.current.has(id)) return;
    passadasRef.current.add(id);
    sincronizarContagens();
  }, [sincronizarContagens]);

  /**
   * Bronca completa nascida nesta patrulha — criada do zero ou vinda de missão
   * cumprida. As duas produzem uma bronca com foto, e é isso que o número diz.
   */
  const registrarBronca = useCallback((id, { deMissao = false } = {}) => {
    if (!id || registradasRef.current.has(id)) return;
    registradasRef.current.add(id);
    // A contagem não separa as duas — as duas produzem bronca com foto. O
    // traçado separa: cumprir a sinalização de outra pessoa é o ponto que mais
    // vale a pena reconhecer no mapa depois.
    marcarAcao(deMissao ? 'missao' : 'bronca');
    sincronizarContagens();
  }, [sincronizarContagens, marcarAcao]);

  /** Sinal deixado no caminho, que virou missão para outra pessoa. */
  const registrarSinal = useCallback((id) => {
    if (!id || sinalizadasRef.current.has(id)) return;
    sinalizadasRef.current.add(id);
    marcarAcao('sinal');
    sincronizarContagens();
  }, [sincronizarContagens, marcarAcao]);

  const registrarConfirmacao = useCallback((id) => {
    if (!id) return;
    // Confirmar implica ter passado. A restrição da tabela exige que as
    // confirmadas sejam subconjunto das passadas, e nem toda confirmação vem de
    // um alerta — as da fila do fim do trajeto chegam depois.
    passadasRef.current.add(id);
    confirmadasRef.current.add(id);
    marcarAcao('confirmacao');
    sincronizarContagens();
  }, [sincronizarContagens, marcarAcao]);

  /**
   * Guarda o percurso, numa tabela à parte.
   *
   * SEPARADA DA PATRULHA DE PROPÓSITO — ver o cabeçalho da migração 188. Em
   * resumo: `patrols` tem policy de leitura pública para quem compartilha, e
   * RLS filtra linha, não coluna. O traço num campo de lá viraria endereço de
   * casa acessível a qualquer um que pedisse a coluna.
   *
   * FALHAR AQUI NÃO FALHA A PATRULHA
   *
   * A patrulha já está gravada quando esta função roda. O percurso é o enfeite:
   * perdê-lo custa um mapa a menos no histórico, enquanto propagar o erro
   * custaria a contagem inteira da saída — e mandaria a pessoa para a tela de
   * "não foi possível salvar" por causa do que ela nem pediu.
   */
  const guardarPercurso = useCallback(async (patrulhaId) => {
    if (!user || !patrulhaId) return;

    // Sem traço E sem ação não há o que guardar — seria oferecer "ver percurso"
    // para não mostrar nada. Com ação e sem traço, sim: quem ficou parado e
    // registrou três broncas tem os três pontos para ver depois.
    const caminho = rastroParaBanco(rastro);
    if (caminho.length < 2 && acoesRef.current.length === 0) return;

    try {
      const { error } = await supabase
        .from('patrol_paths')
        .upsert(
          {
            patrol_id: patrulhaId,
            user_id: user.id,
            path: caminho,
            points: caminho.length,
            // Teto igual ao da constraint da 189: uma patrulha longuíssima não
            // pode fazer a gravação inteira falhar por causa dos pontinhos.
            actions: acoesRef.current.slice(0, 500),
          },
          { onConflict: 'patrol_id' }
        );
      if (error) throw error;
    } catch (err) {
      console.error('[usePatrolRecorder] percurso não foi guardado:', err);
    }
  }, [user, rastro]);

  /**
   * Grava a patrulha — ou atualiza a que já foi gravada.
   *
   * POR QUE PRECISA ATUALIZAR
   *
   * O encerramento virou dois passos: "Encerrar" salva na hora e só então o
   * resumo aparece. Mas o resumo ainda tem a fila de broncas por responder, e
   * cada resposta dada ali muda os números da patrulha.
   *
   * Antes, com a gravação acontecendo no último toque, isso não existia: tudo
   * já estava respondido quando a linha nascia. Agora, sem o update, a patrulha
   * ficaria congelada no instante do "Encerrar" e as confirmações feitas na
   * fila sumiriam da contagem — justamente as que a fila existe para colher.
   *
   * `is_public` nunca volta atrás: compartilhar e depois tocar em "Fechar"
   * chamaria esta função com `publica: false`, e despublicar pelas costas de
   * quem acabou de compartilhar seria o oposto do que o toque pediu.
   *
   * @returns {Promise<{ok:boolean, patrulha?:object, error?:Error}>}
   */
  const finalizar = useCallback(async ({ publica = false } = {}) => {
    if (!user) return { ok: false, error: new Error('sem usuário') };

    const inicio = inicioRef.current ?? Date.now();
    const fim = Date.now();

    const medidas = {
      started_at: new Date(inicio).toISOString(),
      ended_at: new Date(fim).toISOString(),
      duration_seconds: Math.max(0, Math.round((fim - inicio) / 1000)),
      distance_meters: Math.round(distanciaM),
      passed_count: passadasRef.current.size,
      confirmed_count: confirmadasRef.current.size,
      passed_report_ids: [...passadasRef.current],
      confirmed_report_ids: [...confirmadasRef.current],
      // Sempre um número, nunca nulo: nulo nesta coluna significa "gravada por
      // versão anterior", e uma patrulha desta versão que não produziu nada
      // produziu zero — que é sabido, não desconhecido.
      reports_count: registradasRef.current.size,
      registered_report_ids: [...registradasRef.current],
      signals_count: sinalizadasRef.current.size,
      signaled_report_ids: [...sinalizadasRef.current],
    };

    setSalvando(true);
    try {
      const salva = salvaRef.current;

      const { data, error } = salva
        ? await supabase
            .from('patrols')
            .update({
              // O UPDATE MEXE NUMA COISA SÓ, E ISSO É DE PROPÓSITO.
              //
              // A patrulha terminou quando a pessoa tocou em "Encerrar". Mas o
              // GPS continua ligado enquanto o resumo está aberto — a tela não
              // desmontou —, e o rastro continua crescendo atrás dele.
              //
              // Mandar `...medidas` aqui, como esta linha fazia, reabriria a
              // patrulha: quem deixasse o resumo aberto no painel do carro por
              // mais dez minutos de estrada veria a distância e as broncas
              // passadas subirem sozinhas depois de ter encerrado.
              //
              // O que a fila do resumo realmente produz são confirmações. Só
              // elas sobem, e o resto fica como estava no instante do toque.
              confirmed_count: confirmadasRef.current.size,
              confirmed_report_ids: [...confirmadasRef.current],
              is_public: publica || salva.is_public,
            })
            .eq('id', salva.id)
            .select()
            .single()
        : await supabase
            .from('patrols')
            .insert({
              user_id: user.id,
              city_id: cityId ?? null,
              ...medidas,
              is_public: publica,
            })
            .select()
            .single();

      if (error) throw error;
      const primeiraGravacao = !salva;
      salvaRef.current = data;

      // Só na primeira: o traço é o do trajeto que terminou, e regravá-lo
      // depois traria junto os quarteirões andados com o resumo aberto.
      if (primeiraGravacao) await guardarPercurso(data.id);

      return { ok: true, patrulha: data };
    } catch (err) {
      console.error('[usePatrolRecorder] falha ao gravar patrulha:', err);
      return { ok: false, error: err };
    } finally {
      setSalvando(false);
    }
  }, [user, cityId, distanciaM, guardarPercurso]);


  /** Segundos desde a primeira leitura de GPS. Lido ao abrir o resumo. */
  const duracaoAgora = useCallback(
    () => (inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0),
    []
  );

  return {
    rastro,
    distanciaM,
    contagens,
    salvando,
    duracaoAgora,
    registrarPassagem,
    registrarConfirmacao,
    registrarBronca,
    registrarSinal,
    finalizar,
  };
}
