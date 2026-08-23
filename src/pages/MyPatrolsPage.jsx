import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  Loader2, Route as RouteIcon, Timer, CheckCircle2, Flame,
  Radar, Globe, Lock, Share2, Trash2, AlertTriangle, ClipboardCheck,
  Map as MapIcon, Megaphone,
} from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { calcularSequencia } from '@/lib/patrolGame';
import { getPatrolShareUrl } from '@/lib/shareUtils';
import PatrolRouteThumb from '@/components/patrol/PatrolRouteThumb';

const PatrolStoryModal = lazy(() => import('@/components/patrol/PatrolStoryModal'));
const PatrolRouteModal = lazy(() => import('@/components/patrol/PatrolRouteModal'));

// Histórico de patrulhas.
//
// A tabela `patrols` guardava isso desde a migração 172 e ninguém tinha como
// ver: os números apareciam na tela de resumo, nos segundos seguintes a
// encerrar, e sumiam junto com ela. O índice `patrols_user_recentes_idx`
// (user_id, ended_at desc) já existia — a consulta desta página é exatamente a
// que ele foi criado para servir.
//
// Sem migração: a policy `patrols_select_own` já libera as próprias, e é ela
// que garante que este `select` nunca traga a patrulha de outra pessoa mesmo se
// o filtro por user_id fosse esquecido.
//
// O PERCURSO É DAQUI, E SÓ DAQUI
//
// Durante muito tempo o traço não era gravado, de propósito: a rota começa e
// termina na casa de quem patrulha, e publicá-la publicaria isso.
//
// A migração 188 passou a guardá-lo — numa tabela à parte, `patrol_paths`, com
// uma única policy de leitura, a da dona. A preocupação continua de pé; o que
// mudou é que ela virou motivo para não COMPARTILHAR, e não para não guardar.
// Esta é a única tela do app que mostra percurso, e é assim de propósito.
//
// O CARD SÓ APARECE ONDE O NÚMERO É REAL
//
// O card conta quantas broncas e sinalizações saíram DAQUELA saída. Esses
// contadores passaram a ser gravados na migração 178 — antes dela viviam só na
// memória da sessão.
//
// Nas patrulhas antigas as colunas são NULAS, e nulo aqui não é zero: é "não
// sabemos". Por isso o botão só aparece quando há dado. Mostrá-lo sempre faria
// o card de uma patrulha de 2025 afirmar que ela não rendeu nada — a mesma
// invenção de número que a coluna nula existe para evitar.

// Oito por vez. Vinte enchia a primeira tela e mais duas, e cada linha agora
// carrega um traçado — a página abria pesada para mostrar o que ninguém tinha
// rolado até lá para ver.
const POR_PAGINA = 8;

const formatarDuracao = (segundos) => {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

const formatarDistancia = (metros) => {
  const m = Math.max(0, Math.round(metros || 0));
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
};

const formatarData = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

const formatarHora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const Total = ({ Icone, valor, rotulo }) => (
  <div className="flex-1 min-w-0 text-center">
    <Icone size={18} className="mx-auto text-brand mb-1.5" />
    <p className="text-xl font-extrabold text-content-primary leading-none tabular-nums">
      {valor}
    </p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary mt-1">
      {rotulo}
    </p>
  </div>
);

/** Um número com rótulo, dentro do cartão. */
const Medida = ({ Icone, valor, rotulo }) => (
  <div className="flex items-center gap-1.5 min-w-0">
    <Icone size={14} className="shrink-0 text-content-tertiary" />
    <span className="text-sm font-bold text-content-primary tabular-nums">
      {valor}
    </span>
    <span className="text-xs text-content-tertiary truncate">{rotulo}</span>
  </div>
);

const Acao = ({ Icone, children, onClick, tom = 'normal' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl active:bg-surface-subtleHover transition-colors ${
      tom === 'perigo' ? 'text-content-tertiary' : 'text-brand'
    }`}
  >
    <Icone size={14} />
    {children}
  </button>
);

/**
 * Uma patrulha do histórico.
 *
 * O QUE MUDOU E POR QUÊ
 *
 * Antes o cartão era um <Link> com dois botões soltos pendurados embaixo, fora
 * dele, cada um com um recuo diferente. Pareciam sobras — e um deles, "Gerar
 * card", tinha nome de ferramenta, não de intenção.
 *
 * Agora o cartão é um bloco só: o topo leva à patrulha, o meio diz o que ela
 * rendeu, e a barra de baixo tem as três ações com o mesmo peso.
 *
 * OS BOTÕES APARECEM SÓ QUANDO TÊM O QUE MOSTRAR
 *
 * "Percurso" depende de o traço ter sido guardado — nenhuma patrulha anterior à
 * migração 188 tem. "Compartilhar" depende dos contadores da 178. Nos dois
 * casos o dado ou existe ou é nulo, e nulo aqui é "não sabemos", não "zero":
 * um botão que abre o nada é pior que um botão a menos.
 */
const CartaoPatrulha = ({
  patrulha: p,
  tracado,
  onPercurso,
  onCompartilhar,
  onApagar,
}) => {
  const rendeu =
    p.reports_count !== null
      ? (p.reports_count || 0) + (p.signals_count || 0)
      : null;

  return (
    <li className="rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 overflow-hidden">
      {/* Isto era um link para /patrulha/:id, a tela de uma patrulha só.

          Aquela tela não existe mais — ela repetia estes mesmos números com
          letra maior. O que o cartão não mostra está no percurso, e o percurso
          tem botão próprio logo abaixo. Um cartão inteiro clicável levando a
          uma cópia de si mesmo era navegação para lugar nenhum. */}
      <div className="block px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          {/* Conferir e patrulhar produzem linhas com os mesmos campos e
              significados diferentes: uma saída de conferência com "0/0
              conferidas" não falhou — ela nunca teve alerta para responder.
              Sem esta marca, o histórico faz uma parecer uma patrulha ruim. */}
          {p.kind === 'audit' && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-content-tertiary">
              <ClipboardCheck size={10} />
              Conferência
            </span>
          )}
          <span className="text-[15px] font-bold text-content-primary">
            {formatarData(p.ended_at)}
          </span>
          <span className="text-xs text-content-tertiary">
            {formatarHora(p.ended_at)}
          </span>
          {p.city?.name && (
            <span className="text-xs text-content-tertiary truncate min-w-0">
              · {p.city.name}
            </span>
          )}

          <span
            className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              p.is_public
                ? 'bg-brand-subtleBg text-brand'
                : 'bg-surface-subtle text-content-tertiary'
            }`}
            title={p.is_public ? 'Compartilhada' : 'Só você vê'}
          >
            {p.is_public ? <Globe size={10} /> : <Lock size={10} />}
            {p.is_public ? 'Pública' : 'Privada'}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2.5">
          {/* O desenho da saída.

              Uma lista de datas e números não diz nada sobre O QUE foi cada
              patrulha — todas as linhas se parecem, e a tela vira extrato.
              A forma do trajeto é o que a pessoa reconhece: aquele foi o dia
              que ela deu a volta no bairro inteiro, aquele outro foi só a rua
              de casa. Os pontos coloridos dizem onde ela agiu. */}
          {tracado && (
            <PatrolRouteThumb
              path={tracado.path}
              actions={tracado.actions}
              className="w-[92px] h-[60px] md:w-[112px] md:h-[72px]"
            />
          )}

          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <Medida Icone={Timer} valor={formatarDuracao(p.duration_seconds)} rotulo="" />
              <Medida Icone={RouteIcon} valor={formatarDistancia(p.distance_meters)} rotulo="" />
            </div>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              {p.kind === 'audit' ? (
                <Medida
                  Icone={ClipboardCheck}
                  valor={(p.reports_count || 0) + (p.emptied_count || 0)}
                  rotulo="respondidos"
                />
              ) : (
                <Medida
                  Icone={CheckCircle2}
                  valor={`${p.confirmed_count}/${p.passed_count}`}
                  rotulo="conferidas"
                />
              )}
              {/* Só quando a saída rendeu alguma coisa: "0 registros" é ruído
                  numa lista em que a maioria das linhas seria isso. */}
              {p.kind !== 'audit' && rendeu > 0 && (
                <Medida
                  Icone={Megaphone}
                  valor={rendeu}
                  rotulo={rendeu === 1 ? 'registro' : 'registros'}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-stretch border-t border-edge-subtle divide-x divide-edge-subtle">
        {tracado && (
          <Acao Icone={MapIcon} onClick={onPercurso}>
            Percurso
          </Acao>
        )}
        {p.reports_count !== null && (
          <Acao Icone={Share2} onClick={onCompartilhar}>
            Compartilhar
          </Acao>
        )}
        <Acao Icone={Trash2} tom="perigo" onClick={onApagar}>
          Apagar
        </Acao>
      </div>
    </li>
  );
};

export default function MyPatrolsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [patrulhas, setPatrulhas] = useState([]);
  const [totais, setTotais] = useState(null);
  const [sequencia, setSequencia] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [cardDe, setCardDe] = useState(null);
  const [percursoDe, setPercursoDe] = useState(null);
  // Traçado de cada patrulha: id → { path, actions }. Uma consulta por página,
  // não uma por cartão.
  const [tracados, setTracados] = useState(() => new Map());
  const sentinelaRef = useRef(null);
  const emVooRef = useRef(false);
  const [aExcluir, setAExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);

  /**
   * Uma página de patrulhas.
   *
   * Pede um a mais que o tamanho da página para saber se existe próxima sem
   * precisar de uma consulta de contagem.
   */
  const buscarPagina = useCallback(async (desde) => {
    const { data, error } = await supabase
      .from('patrols')
      .select('id, kind, started_at, ended_at, duration_seconds, distance_meters, passed_count, confirmed_count, reports_count, signals_count, emptied_count, is_public, city:cities(name)')
      .eq('user_id', user.id)
      .order('ended_at', { ascending: false })
      .range(desde, desde + POR_PAGINA);

    if (error) throw error;
    const pagina = data || [];
    return { linhas: pagina.slice(0, POR_PAGINA), temMais: pagina.length > POR_PAGINA };
  }, [user]);

  /**
   * Os traçados das patrulhas desta página.
   *
   * VEM PENEIRADO DO SERVIDOR
   *
   * `get_patrol_thumbs` devolve o percurso com uns 48 pontos, não os até 1200
   * que a coluna guarda. Numa figura de 112 pixels de largura o resto não
   * aparece, e vinte patrulhas de percurso inteiro seriam centenas de kB para
   * desenhar selos. O mapa cheio, esse sim, lê a coluna toda — no modal.
   *
   * A RLS de `patrol_paths` continua valendo dentro da função (invoker), então
   * mandar o id de outra pessoa não devolve nada.
   *
   * Falhar aqui tira o desenho, não a página: o histórico continua legível sem
   * ele.
   */
  const buscarTracados = useCallback(async (linhas) => {
    const ids = linhas.map((p) => p.id);
    if (ids.length === 0) return;
    try {
      const { data, error } = await supabase.rpc('get_patrol_thumbs', { p_ids: ids });
      if (error) throw error;
      setTracados((atual) => {
        const proximo = new Map(atual);
        (data || []).forEach((r) => {
          proximo.set(r.patrol_id, { path: r.path, actions: r.actions });
        });
        return proximo;
      });
    } catch (err) {
      console.error('[MyPatrolsPage] falha ao buscar os traçados:', err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;

    (async () => {
      setCarregando(true);
      try {
        const [primeira, stats, dias] = await Promise.all([
          buscarPagina(0),
          supabase.rpc('get_patrol_stats', { target_user_id: user.id }),
          supabase.rpc('get_patrol_days', { target_user_id: user.id, dias: 90 }),
        ]);
        if (cancelado) return;

        setPatrulhas(primeira.linhas);
        setTemMais(primeira.temMais);
        buscarTracados(primeira.linhas);
        setTotais(stats.data?.[0] ?? null);
        // A sequência é calculada no cliente porque a regra de "dias seguidos"
        // é função pura testada — em SQL exigiria generate_series e fuso.
        setSequencia(calcularSequencia((dias.data || []).map((d) => d.dia)));
      } catch (err) {
        console.error('[MyPatrolsPage] falha ao carregar:', err);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => { cancelado = true; };
  }, [user, buscarPagina, buscarTracados]);

  const carregarMais = useCallback(async () => {
    // O observador dispara de novo a cada pixel rolado enquanto a sentinela
    // continua visível — e ela continua, porque a resposta ainda não chegou.
    // Sem esta guarda, uma rolagem até o fim pede a mesma página cinco vezes e
    // as patrulhas aparecem repetidas.
    if (emVooRef.current || !temMais) return;
    emVooRef.current = true;
    setCarregandoMais(true);
    try {
      const { linhas, temMais: ainda } = await buscarPagina(patrulhas.length);
      setPatrulhas((atual) => [...atual, ...linhas]);
      setTemMais(ainda);
      buscarTracados(linhas);
    } catch (err) {
      console.error('[MyPatrolsPage] falha ao carregar mais:', err);
    } finally {
      emVooRef.current = false;
      setCarregandoMais(false);
    }
  }, [buscarPagina, patrulhas.length, buscarTracados, temMais]);

  /**
   * Rolar até o fim traz mais oito.
   *
   * A sentinela é uma div vazia depois do último cartão. Quando ela entra na
   * tela, a próxima página é pedida — é assim que se descobre "chegou ao fim"
   * sem ouvir o evento de scroll, que dispara dezenas de vezes por segundo e
   * obriga a medir alturas na mão.
   *
   * `rootMargin` de 300 px pede a página ANTES de a sentinela aparecer: a
   * requisição acontece enquanto ainda há cartão para ler, e a lista não pisca
   * um vazio no fim.
   *
   * O botão continua embaixo. Não é redundância: se o observador não existir,
   * ou se a lista couber inteira na tela sem gerar rolagem, ele é o único
   * caminho.
   */
  useEffect(() => {
    const alvo = sentinelaRef.current;
    if (!alvo || !temMais || typeof IntersectionObserver === 'undefined') return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) carregarMais();
      },
      { rootMargin: '300px' }
    );
    observador.observe(alvo);

    return () => observador.disconnect();
  }, [temMais, carregarMais]);

  /**
   * Apaga o REGISTRO da patrulha, e só ele.
   *
   * As broncas e os sinais daquela saída são linhas de `reports`, com vida
   * própria: já passaram por moderação, podem ter foto, comentário e apoio de
   * outras pessoas. A tabela `patrols` guarda os ids delas num array, não por
   * chave estrangeira — então não há cascata, e apagar aqui não alcança nada
   * lá. O que se perde é a medida do percurso.
   *
   * A policy `patrols_delete_own` garante o resto: mesmo que este filtro por id
   * fosse burlado, o banco recusaria apagar a patrulha de outra pessoa.
   */
  const excluir = useCallback(async () => {
    if (!aExcluir) return;
    setExcluindo(true);
    try {
      const { error } = await supabase.from('patrols').delete().eq('id', aExcluir.id);
      if (error) throw error;

      setPatrulhas((atual) => atual.filter((p) => p.id !== aExcluir.id));
      setAExcluir(null);
      toast({
        title: 'Registro apagado',
        description: 'Suas broncas e sinalizações continuam lá.',
      });
    } catch (err) {
      console.error('[MyPatrolsPage] falha ao excluir:', err);
      toast({
        title: 'Não foi possível apagar',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setExcluindo(false);
    }
  }, [aExcluir, toast]);

  const resumo = useMemo(
    () => ({
      quantas: totais?.patrols_count ?? 0,
      distancia: formatarDistancia(totais?.total_distance_meters),
      tempo: formatarDuracao(totais?.total_duration_seconds),
      confirmadas: totais?.total_confirmed ?? 0,
    }),
    [totais]
  );

  return (
    <div className="container max-w-2xl mx-auto w-full px-4 py-6 pb-24">
      <Helmet>
        <title>Suas patrulhas | Trombone Cidadão</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PageHeader
        titulo="Suas patrulhas"
        subtitulo="Tudo que você já percorreu com o app ligado."
        paraOnde="/perfil"
      />

      {carregando ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand" />
        </div>
      ) : (
        <>
          {resumo.quantas > 0 && (
            <div className="flex gap-2 rounded-2xl border border-edge-subtle bg-surface-raised px-3 py-4 mb-5 shadow-elevation-1">
              <Total Icone={Timer} valor={resumo.tempo} rotulo="Tempo" />
              <div className="w-px self-stretch bg-edge-subtle" />
              <Total Icone={RouteIcon} valor={resumo.distancia} rotulo="Percorrido" />
              <div className="w-px self-stretch bg-edge-subtle" />
              <Total Icone={CheckCircle2} valor={resumo.confirmadas} rotulo="Confirmou" />
              {sequencia > 0 && (
                <>
                  <div className="w-px self-stretch bg-edge-subtle" />
                  <Total Icone={Flame} valor={sequencia} rotulo="Dias seguidos" />
                </>
              )}
            </div>
          )}

          {patrulhas.length === 0 ? (
            <div className="rounded-2xl border border-edge-subtle bg-surface-subtle px-5 py-10 text-center">
              <Radar size={32} className="mx-auto text-content-tertiary mb-3" />
              <p className="font-bold text-content-primary">
                Nenhuma patrulha ainda
              </p>
              <p className="text-sm text-content-secondary mt-1 leading-snug max-w-sm mx-auto">
                Saia com o app ligado e ele avisa quando você passar perto de uma
                bronca que precisa ser conferida.
              </p>
              <Link
                to="/missoes"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand text-content-onBrand font-bold text-sm px-5 py-2.5 active:scale-[0.97] transition-transform"
              >
                <Radar size={16} />
                Começar uma
              </Link>
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-2.5">
                {patrulhas.map((p) => (
                  <CartaoPatrulha
                    key={p.id}
                    patrulha={p}
                    tracado={tracados.get(p.id)}
                    onPercurso={() => setPercursoDe(p)}
                    onCompartilhar={() => setCardDe(p)}
                    onApagar={() => setAExcluir(p)}
                  />
                ))}
              </ul>

              {temMais && (
                <div ref={sentinelaRef} className="pt-4">
                  {carregandoMais ? (
                    <div className="flex items-center justify-center gap-2 h-11 text-sm text-content-tertiary">
                      <Loader2 size={16} className="animate-spin" />
                      Carregando mais…
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={carregarMais}
                      className="w-full h-11 rounded-xl border border-edge-default text-sm font-semibold text-content-primary"
                    >
                      Ver mais
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Confirmação: apagar é irreversível, e a frase que mais importa aqui é
          a que diz o que NÃO some. */}
      {aExcluir && (
        <div
          className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !excluindo && setAExcluir(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-surface-raised rounded-t-3xl sm:rounded-2xl shadow-2xl px-5 pt-5"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-10 h-10 rounded-full bg-status-pendingBg flex items-center justify-center">
                <AlertTriangle size={20} className="text-status-pendingFg" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-extrabold text-content-primary leading-tight">
                  Apagar este registro?
                </h2>
                <p className="text-sm text-content-secondary mt-1.5 leading-snug">
                  Some o registro da patrulha de{' '}
                  <strong className="text-content-primary">
                    {formatarData(aExcluir.ended_at)}
                  </strong>
                  : tempo, distância e contagens. Não dá para desfazer.
                </p>
                <p className="text-sm text-content-secondary mt-2 leading-snug">
                  <strong className="text-content-primary">
                    As broncas e sinalizações continuam.
                  </strong>{' '}
                  Elas são registros próprios, já publicados — apagar a patrulha
                  não alcança nenhuma delas.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setAExcluir(null)}
                disabled={excluindo}
                className="flex-1 h-12 rounded-2xl border border-edge-default text-content-primary text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={excluir}
                disabled={excluindo}
                className="flex-1 h-12 rounded-2xl bg-danger text-white border border-danger text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {excluindo ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {percursoDe && (
        <Suspense fallback={null}>
          <PatrolRouteModal
            patrulha={percursoDe}
            onFechar={() => setPercursoDe(null)}
          />
        </Suspense>
      )}

      {cardDe && (
        <Suspense fallback={null}>
          <PatrolStoryModal
            contagens={{
              passadas: cardDe.passed_count,
              confirmadas: cardDe.confirmed_count,
            }}
            duracaoS={cardDe.duration_seconds}
            distanciaM={cardDe.distance_meters}
            feitos={{
              // `reports_count` já soma as criadas e as missões cumpridas — o
              // card torna a somar `missoes`, então ele vai zerado aqui.
              broncas: cardDe.reports_count ?? 0,
              missoes: 0,
              sinais: cardDe.signals_count ?? 0,
            }}
            // Cidade, não bairro: é o que a linha guarda. Nível e título de
            // bairro ficam de fora de propósito — são de HOJE, e carimbá-los
            // numa patrulha de meses atrás contaria uma história que não é a
            // daquele dia.
            lugar={cardDe.city?.name || null}
            titulo={null}
            nivel={null}
            shareUrl={getPatrolShareUrl(cardDe.id)}
            patrulhaId={cardDe.id}
            onFechar={() => setCardDe(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
