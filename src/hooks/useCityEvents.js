import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { showAppError, showAppNotice } from '@/lib/appError';
import { tiposDoFiltro } from '@/lib/cityEvents';
import { removerImagemDeAcontecimento, uploadImagemDeAcontecimento } from '@/lib/cityEventMedia';

// Acesso aos acontecimentos do Trombone Agora.
//
// POR QUE TUDO PASSA POR RPC
//
// `city_event_areas.area_id` é polimórfico — aponta para `bairros` ou para
// `pavement_streets` conforme o tipo — então não há FK, e o PostgREST não sabe
// embutir o nome do bairro. Sem `get_city_events`, cada cartão da lista faria
// uma consulta de rótulo, e a tela de vinte alertas faria vinte e uma idas.
//
// Na escrita a razão é outra: cada transição precisa escrever a linha do tempo
// e avisar quem acompanha (regras 8 e 10 do plano). Um `update` direto em
// `status` produziria um evento resolvido que ninguém soube que resolveu.

/** O id vem do PostgREST como string quando a coluna é bigint. Comparar sem
 *  normalizar já causou bug de city_id nulo neste projeto. */
const mesmoId = (a, b) => String(a ?? '') === String(b ?? '');

const naoEncontrada = (error) =>
  error?.code === 'PGRST202' || /does not exist|não existe/i.test(error?.message || '');

/**
 * A lista do Agora.
 *
 * `escopo` separa as duas seções da tela: 'abertos' é o que está acontecendo,
 * 'resolvidos' é a lista de "resolvidos recentemente". São duas consultas e não
 * um filtro no cliente porque a segunda tem ordenação própria (por resolução, e
 * não por início) e um limite bem menor.
 */
export function useCityEvents(cityId, { filtro = 'todos', escopo = 'abertos', limite = 50 } = {}) {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [indisponivel, setIndisponivel] = useState(false);

  const statuses = useMemo(
    () => (escopo === 'resolvidos' ? ['resolved'] : ['active', 'awaiting_confirmation', 'scheduled']),
    [escopo]
  );

  const tipos = useMemo(() => tiposDoFiltro(filtro), [filtro]);

  const carregar = useCallback(async () => {
    if (!cityId) {
      setEventos([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const { data, error } = await supabase.rpc('get_city_events', {
      p_city_id: cityId,
      p_statuses: statuses,
      p_types: tipos,
      p_limit: limite,
    });
    setCarregando(false);

    if (error) {
      // A migração 206 pode não ter rodado ainda no ambiente. Uma tela vazia é
      // melhor que um erro vermelho para quem só abriu o app.
      if (naoEncontrada(error)) {
        setIndisponivel(true);
        setEventos([]);
        return;
      }
      showAppError({ title: 'Não foi possível carregar o Radar da cidade', description: error.message });
      return;
    }

    setIndisponivel(false);
    const lista = data || [];
    if (lista.length === 0) { setEventos([]); return; }
    const { data: recorrencias } = await supabase
      .from('city_events')
      .select('id, recurrence')
      .in('id', lista.map((evento) => evento.id));
    const porId = new Map((recorrencias || []).map((item) => [String(item.id), item.recurrence]));
    setEventos(lista.map((evento) => ({ ...evento, recurrence: porId.get(String(evento.id)) || null })));
  }, [cityId, statuses, tipos, limite]);

  useEffect(() => { carregar(); }, [carregar]);

  return { eventos, carregando, indisponivel, recarregar: carregar };
}

/** Um acontecimento com áreas, linha do tempo e placar da enquete, numa ida. */
export function useCityEvent(eventId) {
  const [evento, setEvento] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [naoAchou, setNaoAchou] = useState(false);

  const carregar = useCallback(async () => {
    if (!eventId) return;
    setCarregando(true);
    const { data, error } = await supabase.rpc('get_city_event', { p_event_id: eventId });
    setCarregando(false);

    if (error) {
      showAppError({ title: 'Não foi possível abrir o acontecimento', description: error.message });
      setNaoAchou(true);
      return;
    }
    if (!data) {
      setNaoAchou(true);
      return;
    }
    const { data: recorrencia } = await supabase
      .from('city_events')
      .select('recurrence')
      .eq('id', eventId)
      .maybeSingle();
    setEvento({ ...data, recurrence: recorrencia?.recurrence || null });
  }, [eventId]);

  useEffect(() => { carregar(); }, [carregar]);

  return { evento, carregando, naoAchou, recarregar: carregar };
}

/** Os acontecimentos que pegam numa rua. É o que Minha Rua consulta. */
export function useStreetCityEvents(streetId) {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(Boolean(streetId));

  const carregar = useCallback(async () => {
    if (!streetId) { setEventos([]); setCarregando(false); return; }
    setCarregando(true);
    const { data, error } = await supabase.rpc('get_street_city_events', { p_street_id: streetId });
    setCarregando(false);
    // Silencioso de propósito: isto é uma faixa a mais numa página que já
    // funciona sem ela. Um erro vermelho no topo da história da rua por causa
    // de um alerta que não carregou seria pior que a faixa não aparecer.
    if (error) { setEventos([]); return; }
    setEventos(data || []);
  }, [streetId]);

  useEffect(() => { carregar(); }, [carregar]);

  return { eventos, carregando, recarregar: carregar };
}

/**
 * As ações de gestão.
 *
 * Todas devolvem `true`/`false` em vez de lançar: quem chama é um botão, e um
 * botão precisa saber se fecha o modal — não tratar exceção.
 */
export function useCityEventActions({ aoConcluir } = {}) {
  const [salvando, setSalvando] = useState(false);
  const aoConcluirRef = useRef(aoConcluir);
  aoConcluirRef.current = aoConcluir;

  const chamar = useCallback(async (rpc, args, mensagemOk, { finalizar = true } = {}) => {
    setSalvando(true);
    const { data, error } = await supabase.rpc(rpc, args);
    setSalvando(false);

    if (error) {
      showAppError({ title: 'Não foi possível concluir', description: error.message });
      return null;
    }
    if (finalizar) {
      if (mensagemOk) showAppNotice({ title: mensagemOk });
      await aoConcluirRef.current?.();
    }
    return data ?? true;
  }, []);

  /**
   * Envia a foto, se houver, e devolve `{ url, path }` — ou `null`.
   *
   * O UPLOAD VEM ANTES DA GRAVAÇÃO, E FALHAR AQUI CANCELA TUDO
   *
   * A ordem inversa (gravar e depois subir) parece mais segura e é pior: o
   * acontecimento já teria sido publicado, o push já teria saído, e a foto
   * chegaria depois — ou não chegaria, e ninguém saberia. Subindo antes, uma
   * falha de rede só custa uma tentativa a mais.
   *
   * O preço é o objeto órfão quando o upload dá certo e o INSERT falha. É de
   * longe o menor dos dois: um arquivo de 5 MB no bucket contra um alerta
   * publicado sem a imagem que o gestor achou que tinha anexado.
   */
  const subirImagem = useCallback(async (file, cityId) => {
    if (!file) return null;
    // `salvando` também cobre o upload: sem isto o botão fica solto durante os
    // segundos em que uma foto de 5 MB sobe, e um segundo toque publica o
    // acontecimento duas vezes.
    setSalvando(true);
    try {
      return await uploadImagemDeAcontecimento({ supabase, file, cityId });
    } catch (erro) {
      showAppError({ title: 'Não foi possível enviar a imagem', description: erro.message });
      return { falhou: true };
    } finally {
      setSalvando(false);
    }
  }, []);

  return {
    salvando,

    criar: async (dados) => {
      const imagem = await subirImagem(dados.imagemNova, dados.cityId);
      if (imagem?.falhou) return null;

      const id = await chamar('create_city_event', {
        p_city_id: dados.cityId,
        p_type: dados.type,
        p_title: dados.title,
        p_areas: dados.areas,
        p_description: dados.description || null,
        p_severity: dados.severity || 'warning',
        p_started_at: dados.startedAt || null,
        p_estimated_end_at: dados.estimatedEndAt || null,
        p_source_name: dados.sourceName || null,
        p_source_url: dados.sourceUrl || null,
        p_notify: dados.type === 'event' ? false : dados.notify !== false,
        p_status: dados.status || 'active',
        p_image_url: imagem?.url || null,
        p_image_path: imagem?.path || null,
        p_estimated_end_day_only: Boolean(dados.estimatedEndDayOnly),
        p_source_button_label: dados.sourceButtonLabel || null,
      }, null, { finalizar: false });

      // A gravação falhou depois do upload: o objeto não pertence a nada.
      if (!id && imagem?.path) await removerImagemDeAcontecimento(supabase, imagem.path);
      if (id) {
        if (dados.type === 'event') {
          await supabase.from('city_events').update({ recurrence: dados.recurrence || null }).eq('id', id);
        }
        showAppNotice({ title: dados.status === 'draft' ? 'Rascunho salvo.' : 'Acontecimento publicado.' });
        await aoConcluirRef.current?.();
      }
      return id;
    },

    editar: async (eventId, dados) => {
      const imagem = await subirImagem(dados.imagemNova, dados.cityId);
      if (imagem?.falhou) return null;

      const ok = await chamar('update_city_event', {
        p_event_id: eventId,
        p_title: dados.title ?? null,
        p_description: dados.description ?? null,
        p_type: dados.type ?? null,
        p_severity: dados.severity ?? null,
        p_started_at: dados.startedAt ?? null,
        p_estimated_end_at: dados.estimatedEndAt ?? null,
        p_source_name: dados.sourceName ?? null,
        p_source_url: dados.sourceUrl ?? null,
        p_areas: dados.areas ?? null,
        p_image_url: imagem?.url || null,
        p_image_path: imagem?.path || null,
        p_limpar_imagem: Boolean(dados.limparImagem),
        p_estimated_end_day_only: dados.estimatedEndDayOnly ?? null,
        // Duas informações diferentes: o texto novo, e "apague o que havia".
        // `coalesce` no banco não distingue "não mexi" de "quero limpar" — é o
        // mesmo par de `p_image_url`/`p_limpar_imagem`.
        p_source_button_label: dados.sourceButtonLabel || null,
        p_limpar_botao: !dados.sourceButtonLabel,
      }, null, { finalizar: false });

      if (!ok) {
        if (imagem?.path) await removerImagemDeAcontecimento(supabase, imagem.path);
        return null;
      }

      await supabase.from('city_events').update({ recurrence: dados.recurrence || null }).eq('id', eventId);

      showAppNotice({ title: 'Acontecimento atualizado.' });
      await aoConcluirRef.current?.();

      // A foto antiga só sai DEPOIS de a nova estar gravada. Apagar antes
      // deixaria o acontecimento sem imagem nenhuma se a gravação falhasse.
      const trocouOuLimpou = Boolean(imagem?.path) || dados.limparImagem;
      if (trocouOuLimpou && dados.imagemAnterior && dados.imagemAnterior !== imagem?.path) {
        await removerImagemDeAcontecimento(supabase, dados.imagemAnterior);
      }
      return ok;
    },

    publicar: (eventId) => chamar('publish_city_event', { p_event_id: eventId, p_notify: true }, 'Publicado.'),

    adicionarAtualizacao: (eventId, message, notify = false) =>
      chamar('add_city_event_progress', { p_event_id: eventId, p_message: message, p_notify: notify }, 'Atualização registrada.'),

    prorrogar: (eventId, novaPrevisao, message, soDia = null) =>
      chamar('extend_city_event', {
        p_event_id: eventId,
        p_new_estimated_end_at: novaPrevisao,
        p_message: message || null,
        p_day_only: soDia,
      }, 'Previsão atualizada.'),

    resolver: (eventId, message) =>
      chamar('resolve_city_event', { p_event_id: eventId, p_message: message || null }, 'Marcado como normalizado.'),

    reabrir: (eventId, novaPrevisao, message) =>
      chamar('reopen_city_event', {
        p_event_id: eventId,
        p_new_estimated_end_at: novaPrevisao || null,
        p_message: message || null,
      }, 'Acontecimento reaberto.'),

    cancelar: (eventId, message) =>
      chamar('cancel_city_event', { p_event_id: eventId, p_message: message || null }, 'Acontecimento cancelado.'),

    confirmar: (eventId, status) =>
      chamar('confirm_city_event', { p_event_id: eventId, p_status: status }, 'Obrigado por responder.'),

    /**
     * REMOVER NÃO É CANCELAR — e a diferença é o silêncio.
     *
     * `cancelar` avisa quem foi avisado, e tem de avisar: um alerta de falta
     * de água que some calado deixa a cidade achando que a falta continua.
     *
     * Remover é para o aviso que nunca deveria ter existido — o teste que
     * escapou, a duplicata, a cidade errada. Notificar o cancelamento de uma
     * coisa que a pessoa nunca soube que existia é criar o susto que a remoção
     * está tentando desfazer.
     *
     * Não passa pelo `chamar` porque o desfecho é outro: não há o que
     * recarregar depois — quem chamou está olhando para uma linha que deixou de
     * existir, e é quem chamou que decide para onde ir.
     */
    remover: async (eventId) => {
      setSalvando(true);
      const { data, error } = await supabase.rpc('delete_city_event', { p_event_id: eventId });
      setSalvando(false);

      if (error) {
        showAppError({ title: 'Não foi possível remover', description: error.message });
        return false;
      }

      // A foto não sai junto: o Storage não tem gatilho de banco, e por isso a
      // RPC devolve o caminho dela em vez de `void`. Falhar aqui não desfaz a
      // remoção — o aviso já não existe, e um arquivo órfão é o menor dos dois.
      if (data) await removerImagemDeAcontecimento(supabase, data);

      showAppNotice({
        title: 'Acontecimento removido',
        description: 'Ninguém foi notificado.',
      });
      return true;
    },
  };
}

/**
 * A varredura da previsão, disparada quando um gestor abre o Agora.
 *
 * POR QUE O APP CHAMA ALGO QUE DEVERIA SER CRON
 *
 * A 206 agenda `sweep_city_events` no pg_cron quando a extensão existe. Ela
 * pode não existir — e sem ninguém rodando a varredura, a seção 12 do plano
 * simplesmente não acontece: a previsão vence e nada avisa o responsável.
 *
 * A função é idempotente (quem já foi avisado tem `overdue_notified_at`), então
 * as duas fontes convivem sem duplicar aviso. Uma vez por montagem, sem repetir
 * enquanto a tela estiver aberta.
 */
export function useSweepCityEvents(habilitado) {
  const jaRodou = useRef(false);

  useEffect(() => {
    if (!habilitado || jaRodou.current) return;
    jaRodou.current = true;
    supabase.rpc('sweep_city_events').then(() => {});
  }, [habilitado]);
}

/**
 * Acompanhar uma rua, um bairro ou a cidade.
 *
 * Vai direto na tabela, sem RPC: a policy de `user_area_follows` é "só o dono,
 * em tudo", e não há efeito colateral nenhum a coordenar — ninguém precisa ser
 * avisado de que outra pessoa passou a acompanhar a própria rua.
 */
export function useAreaFollow({ areaType, areaId, cityId }) {
  const { user } = useAuth();
  const [follow, setFollow] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const chave = useMemo(() => {
    if (!areaType) return null;
    if (areaType === 'city') return cityId ? { area_type: 'city', city_id: cityId } : null;
    return areaId ? { area_type: areaType, area_id: areaId } : null;
  }, [areaType, areaId, cityId]);

  const carregar = useCallback(async () => {
    if (!user?.id || !chave) { setFollow(null); setCarregando(false); return; }

    let query = supabase.from('user_area_follows').select('*').eq('user_id', user.id).eq('area_type', chave.area_type);
    query = chave.area_type === 'city'
      ? query.eq('city_id', chave.city_id)
      : query.eq('area_id', chave.area_id);

    const { data } = await query.maybeSingle();
    setFollow(data || null);
    setCarregando(false);
  }, [user?.id, chave]);

  useEffect(() => { carregar(); }, [carregar]);

  const acompanhar = useCallback(async (preferencias = {}) => {
    if (!user?.id || !chave) return false;
    setSalvando(true);
    const { data, error } = await supabase
      .from('user_area_follows')
      .insert({ user_id: user.id, city_id: cityId ?? null, ...chave, ...preferencias })
      .select()
      .single();
    setSalvando(false);

    if (error) {
      showAppError({ title: 'Não foi possível acompanhar', description: error.message });
      return false;
    }
    setFollow(data);
    showAppNotice({ title: 'Pronto! Você vai receber os avisos desta região.' });
    return true;
  }, [user?.id, chave, cityId]);

  const deixarDeAcompanhar = useCallback(async () => {
    if (!follow) return false;
    setSalvando(true);
    const { error } = await supabase.from('user_area_follows').delete().eq('id', follow.id);
    setSalvando(false);
    if (error) {
      showAppError({ title: 'Não foi possível parar de acompanhar', description: error.message });
      return false;
    }
    setFollow(null);
    return true;
  }, [follow]);

  const atualizarPreferencias = useCallback(async (preferencias) => {
    if (!follow) return false;
    // Atualização otimista: o interruptor precisa responder ao toque. Ele
    // volta sozinho se a gravação falhar.
    const anterior = follow;
    setFollow({ ...follow, ...preferencias });

    const { error } = await supabase.from('user_area_follows').update(preferencias).eq('id', follow.id);
    if (error) {
      setFollow(anterior);
      showAppError({ title: 'Não foi possível salvar a preferência', description: error.message });
      return false;
    }
    return true;
  }, [follow]);

  return {
    follow,
    acompanhando: Boolean(follow),
    carregando,
    salvando,
    acompanhar,
    deixarDeAcompanhar,
    atualizarPreferencias,
    recarregar: carregar,
  };
}

/**
 * Quem pode publicar acontecimentos nesta cidade, e com qual papel.
 *
 * Espelha `city_event_role` da 206 — e, como todo espelho de permissão neste
 * app, serve só para esconder botão. A autoridade continua sendo a função no
 * banco: um botão que apareça por engano vira erro do PostgREST, nunca gravação
 * indevida (mesma nota de `useCanManagePavement`).
 */
export function useCanManageCityEvents(cityId) {
  const { user } = useAuth();
  const [cidadesDoEmbaixador, setCidadesDoEmbaixador] = useState([]);
  const [bairrosDesignados, setBairrosDesignados] = useState([]);

  const ehEmbaixadorPuro = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);

  useEffect(() => {
    if (!user?.id || !user?.is_ambassador) { setCidadesDoEmbaixador([]); return; }
    let cancelado = false;
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        if (!cancelado) setCidadesDoEmbaixador((data || []).map((r) => r.city_id));
      });
    return () => { cancelado = true; };
  }, [user?.id, user?.is_ambassador]);

  // Os bairros designados só ESTREITAM (ver a 206). Sem linhas, o embaixador
  // continua com a cidade inteira — que é o comportamento de hoje e o que não
  // pode mudar sozinho para ninguém.
  useEffect(() => {
    if (!user?.id || !user?.is_ambassador || !cityId) { setBairrosDesignados([]); return; }
    let cancelado = false;
    supabase
      .from('ambassador_areas')
      .select('area_id')
      .eq('user_id', user.id)
      .eq('city_id', cityId)
      .then(({ data }) => {
        if (!cancelado) setBairrosDesignados((data || []).map((r) => r.area_id));
      });
    return () => { cancelado = true; };
  }, [user?.id, user?.is_ambassador, cityId]);

  const ehEmbaixadorDaCidade = Boolean(
    cityId && cidadesDoEmbaixador.some((id) => mesmoId(id, cityId))
  );

  const papel = user?.is_master ? 'master'
    : user?.is_admin ? 'admin'
    : ehEmbaixadorDaCidade ? 'ambassador'
    : null;

  return {
    podeGerir: papel !== null,
    papel,
    ehEmbaixadorPuro,
    // Vazio significa "cidade inteira", não "nenhum bairro".
    bairrosDesignados,
    restritoABairros: ehEmbaixadorPuro && bairrosDesignados.length > 0,
  };
}
