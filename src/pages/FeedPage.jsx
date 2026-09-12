import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart2, Briefcase, Building, Compass, Construction, Download,
  FileSignature, MapPin, Megaphone, Newspaper, Radio,
  Route as RouteIcon, ShieldCheck, Smartphone,
} from 'lucide-react';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useFeed } from '@/hooks/useFeed';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCreateReport } from '@/hooks/useCreateReport';
import { useFeedRealtime } from '@/hooks/useFeedRealtime';
import { useSwipeTabs } from '@/hooks/useSwipeTabs';
import { useCity } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import FeedCard from '@/components/FeedCard';
import FeedSkeleton from '@/components/FeedSkeleton';
import FeedEmptyState from '@/components/FeedEmptyState';
import ReportModal from '@/components/ReportModal';
import FeedUpdateModal from '@/components/feed/FeedUpdateModal';
import FeedTabs, { FEED_TABS } from '@/components/feed/FeedTabs';
import FeedStates, { FeedFatalState, FeedLoadMoreError } from '@/components/feed/FeedStates';
import FeedWelcomeCard from '@/components/feed/FeedWelcomeCard';
import FeedLocationGate from '@/components/feed/FeedLocationGate';
import FeedNewReportsBanner from '@/components/feed/FeedNewReportsBanner';
import CityEventCard from '@/components/agora/CityEventCard';
import { useCityEvents } from '@/hooks/useCityEvents';
import { showAppError } from '@/lib/appError';
import SuggestedProfiles from '@/components/SuggestedProfiles';

// Lazy: carrega html-to-image e qrcode, peso que so faz sentido quando o
// usuario abre o card. Um unico modal serve a lista inteira.
const ReportStoryModal = React.lazy(
  () => import('@/components/report/ReportStoryModal')
);

const getInviteUrl = () => {
  const envUrl = import.meta.env.VITE_APP_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');

  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  if (origin && origin.includes('localhost')) return origin;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : 'https://trombonecidadao.com.br';

  return prodUrl;
};

// OS ATALHOS DA COLUNA DA ESQUERDA
//
// Em 1920px o feed vivia num miolo de 78rem com ~330px de vazio de cada lado, e
// o app inteiro — obras, ruas, imóveis, serviços — só existia atrás do "Mais" do
// header. A terceira coluna usa esse espaço para o que já é o assunto da página:
// para onde ir depois de ler o feed.
//
// ELES NÃO REPETEM A COLUNA DA DIREITA: lá ficam as duas telas DESTA cidade
// (mapa de broncas e radar) e o que está acontecendo nela agora; aqui fica o
// resto do app. Um mesmo link nas duas colunas faria a página parecer dois menus
// discordando entre si.
const MODULOS = [
  { nome: 'Obras públicas', path: '/obras-publicas', Icone: Construction },
  { nome: 'Ruas e pavimentação', path: '/mapa-pavimentacao', Icone: RouteIcon },
  { nome: 'Imóveis alugados', path: '/imoveis-alugados', Icone: Building },
  { nome: 'Serviços', path: '/servicos', Icone: Briefcase },
  { nome: 'Abaixo-assinados', path: '/abaixo-assinados', Icone: FileSignature },
  { nome: 'Notícias', path: '/noticias', Icone: Newspaper },
  { nome: 'Estatísticas', path: '/estatisticas', Icone: BarChart2 },
];

export default function FeedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCityId, activeCityName } = useCity();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('recent');
  const [showReportModal, setShowReportModal] = useState(false);
  // O modal de atualizacao vive AQUI, nao no card: um so para a lista inteira, e
  // fora da arvore do card — que tem transform (tc-animate-in) e prenderia o
  // position:fixed do modal ao proprio card em vez da janela.
  const [updateTarget, setUpdateTarget] = useState(null);
  const [storyTarget, setStoryTarget] = useState(null);
  const [recentCreatedId, setRecentCreatedId] = useState(null);
  const recentCreatedTimerRef = useRef(null);
  const preloadedImagesRef = useRef(new Set());
  const leftSidebarRef = useRef(null);
  const rightSidebarRef = useRef(null);
  const [sidebarShift, setSidebarShift] = useState({ left: 0, right: 0 });

  const { createReport } = useCreateReport({ onCreated: () => setShowReportModal(false) });

  const { coords, status: geoStatus, request: requestLocation } = useUserLocation();
  const isNearby = activeTab === 'nearby';
  // So passamos coords na aba nearby: nas outras a posicao nao filtra nada e
  // mudar de aba nao deve disparar recarga.
  const feedCoords = isNearby ? coords : null;
  // Sem posicao, a aba mostra o gate em vez de uma lista que ignora a distancia.
  const awaitingLocation = isNearby && !coords;

  const {
    reports, loading, loadingMore, hasMore, loadMore, refresh,
    toggleUpvote, error, isSlow, loadMoreError, isSlowMore,
  } = useFeed(activeTab, activeCityId, feedCoords);
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Sentinel for infinite scroll
  const sentinelRef = useInfiniteScroll(loadMore, {
    enabled: !loading && !loadingMore && hasMore && !loadMoreError,
  });

  // Realtime: count new reports since page load
  const { newCount, resetNewCount } = useFeedRealtime();

  const handleRefresh = useCallback(() => {
    resetNewCount();
    refresh({ preserve: true });
  }, [refresh, resetNewCount]);

  useEffect(() => {
    const onReportsUpdated = (e) => {
      const createdId = e?.detail?.id || null;
      setActiveTab('recent');
      resetNewCount();
      refresh({ preserve: true });
      if (createdId) {
        setRecentCreatedId(createdId);
        if (recentCreatedTimerRef.current) clearTimeout(recentCreatedTimerRef.current);
        recentCreatedTimerRef.current = setTimeout(() => setRecentCreatedId(null), 8000);
      }
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {}
    };

    window.addEventListener('reports-updated', onReportsUpdated);
    return () => {
      window.removeEventListener('reports-updated', onReportsUpdated);
      if (recentCreatedTimerRef.current) clearTimeout(recentCreatedTimerRef.current);
    };
  }, [refresh, resetNewCount]);

  useEffect(() => {
    const urls = (reports || []).map((r) => r?.coverImage).filter(Boolean).slice(0, 6);
    for (const url of urls) {
      if (preloadedImagesRef.current.has(url)) continue;
      preloadedImagesRef.current.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }, [reports]);

  // Direcao da ultima troca de aba, para a lista entrar pelo lado certo.
  // Vale tambem para o clique na barra: pular de "Recentes" para "Em alta"
  // anima como se tivesse arrastado, senao o movimento so existiria no gesto.
  const [tabDirection, setTabDirection] = useState('forward');

  const handleTabChange = useCallback((tabKey, direction) => {
    if (direction) {
      setTabDirection(direction);
    } else {
      const from = FEED_TABS.findIndex((t) => t.key === activeTab);
      const to = FEED_TABS.findIndex((t) => t.key === tabKey);
      setTabDirection(to >= from ? 'forward' : 'back');
    }
    setActiveTab(tabKey);
    resetNewCount();
    setRecentCreatedId(null);
  }, [activeTab, resetNewCount]);

  const swipeHandlers = useSwipeTabs({
    tabs: FEED_TABS,
    activeTab,
    onChange: handleTabChange,
  });

  // Pede a posicao na primeira vez que a aba "Perto de mim" abre. Depois disso
  // so o botao do gate dispara: em 'denied' repetir nao reabre o prompt, e em
  // 'unavailable' um retry automatico a cada render viraria loop de GPS.
  const askedLocationRef = useRef(false);
  useEffect(() => {
    if (activeTab !== 'nearby' || askedLocationRef.current) return;
    askedLocationRef.current = true;
    requestLocation();
  }, [activeTab, requestLocation]);

  const handleOpenCreate = useCallback(() => setShowReportModal(true), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const shouldOpen = params.get('criar_bronca') === '1' || params.get('criar_bronca') === 'true';
    if (!shouldOpen) return;
    setShowReportModal(true);
    try {
      params.delete('criar_bronca');
      const next = params.toString();
      navigate(`${location.pathname || '/'}${next ? `?${next}` : ''}`, { replace: true });
    } catch {}
  }, [location.pathname, location.search, navigate]);

  const handleInvite = useCallback(async () => {
    const url = getInviteUrl();
    const title = 'Trombone Cidadão';
    const text = 'Vem ajudar a melhorar a cidade: cadastre uma bronca e apoie as causas.';
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title, text, url, dialogTitle: 'Convidar' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        showAppError({ title: 'Não foi possível compartilhar', variant: 'destructive' });
      }
    }
  }, []);

  const hasReports = reports.length > 0;
  const cityLabel = activeCityName || 'todas as cidades';
  // O RADAR ENTRA COM CONTEÚDO, E NÃO COMO MAIS UM LINK
  //
  // A lateral tinha só o botão "Radar da cidade" — e um botão não dá motivo
  // para tocá-lo. Três alertas ativos dão: falta de água no bairro, rua
  // interditada, energia programada. É a mesma consulta e o mesmo cartão da
  // home do desktop (`get_city_events` via RPC, `CityEventCard compact`), então
  // não há um segundo desenho de alerta para manter em dia.
  const radar = useCityEvents(activeCityId, { escopo: 'abertos', limite: 3 });
  const eventosDoRadar = radar.eventos || [];
  const agora = useMemo(() => new Date(), []);

  useEffect(() => {
    let frame = 0;

    const updateSidebarShift = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const footer = document.querySelector('[data-site-footer]');
        const footerTop = footer?.getBoundingClientRect().top ?? window.innerHeight;
        const availableBottom = Math.min(window.innerHeight - 16, footerTop - 16);
        const shiftFor = (element) => element
          ? Math.max(0, Math.ceil(80 + element.offsetHeight - availableBottom))
          : 0;
        const next = {
          left: shiftFor(leftSidebarRef.current),
          right: shiftFor(rightSidebarRef.current),
        };

        setSidebarShift((current) => (
          current.left === next.left && current.right === next.right ? current : next
        ));
      });
    };

    updateSidebarShift();
    window.addEventListener('scroll', updateSidebarShift, { passive: true });
    window.addEventListener('resize', updateSidebarShift);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateSidebarShift);
      window.removeEventListener('resize', updateSidebarShift);
    };
  }, [eventosDoRadar.length]);

  // Missões só para quem tem conta: a central é toda sobre progresso pessoal e
  // abre vazia para visitante — a mesma regra que o cartão do topo do celular já
  // aplica. No lugar dela, o convite para virar embaixador.
  const atalhos = useMemo(
    () => [
      user
        ? { nome: 'Missões', path: '/missoes', Icone: Compass }
        : { nome: 'Seja embaixador', path: '/seja-embaixador', Icone: ShieldCheck },
      ...MODULOS,
    ],
    [user]
  );

  return (
    <div className="min-h-full bg-surface-base">
      {/* O seletor de cidade agora vive no header (Header/MobileHeader): e um
          filtro global, nao um controle desta pagina. O titulo "Feed" e o botao
          "Nova denuncia" sairam — as abas ja identificam a secao, e criar bronca
          continua no FAB do bottom nav e no atalho abaixo. */}
      <div className="lg:hidden">
        <FeedWelcomeCard onCreateReport={handleOpenCreate} onInvite={handleInvite} />
      </div>

      {/* Em notebooks, conteúdo e contexto dividem a tela em duas colunas.
          A navegação exploratória ganha uma terceira coluna apenas em telas largas. */}
      <div className="lg:mx-auto lg:grid lg:w-full lg:max-w-[100rem] lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5 lg:px-6 lg:py-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6 xl:py-7 2xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
        {/* Em telas largas, esta coluna fica ancorada abaixo do cabeçalho. */}
        <nav
          ref={leftSidebarRef}
          className="hidden 2xl:fixed 2xl:top-20 2xl:z-10 2xl:block 2xl:max-h-[calc(100dvh-6rem)] 2xl:w-[17rem] 2xl:overflow-y-auto 2xl:overscroll-contain 2xl:pb-2 2xl:scrollbar-none"
          style={{ left: 'max(1.5rem, calc((100vw - 100rem) / 2 + 1.5rem))', transform: `translateY(-${sidebarShift.left}px)` }}
          aria-label="Outras seções do Trombone"
        >
          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
            <h2 className="px-1 text-sm font-extrabold text-content-primary">Explorar o app</h2>
            <p className="mt-1 px-1 text-xs leading-5 text-content-secondary">
              O que existe além do feed.
            </p>

            <ul className="mt-3 space-y-0.5">
              {atalhos.map(({ nome, path, Icone }) => (
                <li key={path}>
                  <Link
                    to={path}
                    className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-bold text-content-primary transition hover:bg-brand/5"
                  >
                    <Icone className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{nome}</span>
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-content-tertiary opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Dentro do app instalado isto seria oferecer o que a pessoa já tem —
              e a coluna só existe em 1520px, largura que um tablet alcança. */}
          {!Capacitor.isNativePlatform() && (
            <section className="mt-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-sm font-extrabold text-content-primary">
                Trombone no celular
              </h2>
              <p className="mt-1 text-xs leading-5 text-content-secondary">
                Registre com foto na hora e receba aviso quando sua bronca andar.
              </p>
              <Link
                to="/app"
                className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-surface-sunken text-xs font-bold text-content-primary transition hover:bg-edge-subtle"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Baixar o app
              </Link>
            </section>
          )}

        </nav>

        <main className="min-w-0 lg:col-start-1 2xl:col-start-2">
          <section className="hidden overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised p-7 shadow-sm lg:flex lg:items-center lg:justify-between lg:gap-8">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-xs font-bold text-brand">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                Participação cidadã
              </div>
              <h1 className="text-3xl font-black tracking-tight text-content-primary">
                Acontecendo em {cityLabel}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
                Acompanhe relatos da comunidade, apoie prioridades e veja as atualizações mais recentes da cidade.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Registrar bronca
            </button>
          </section>

          {/* ── Sticky Tab Bar ── */}
          <div className="sticky top-0 z-10 border-b border-edge-subtle bg-surface-base/90 backdrop-blur-md lg:static lg:mt-5 lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-surface-raised lg:shadow-sm">
            <div className="container mx-auto max-w-2xl px-3 lg:max-w-none lg:px-5">
              <FeedTabs tabs={FEED_TABS} activeTab={activeTab} onChange={handleTabChange} />
            </div>
          </div>

          {/* ── "X novas broncas" banner ── */}
          <FeedNewReportsBanner count={newCount} onRefresh={handleRefresh} />

          {/* ── Feed Content ── */}
          {/* Arrastar na horizontal troca de aba. Fica neste container, e nao na
              pagina toda, para nao capturar arrasto do header nem do bottom nav. */}
          <div className="container mx-auto max-w-2xl px-3 py-4 lg:max-w-none lg:px-0 lg:py-5" {...swipeHandlers}>
        {/* Enquanto falta a posicao nao ha requisicao em curso: mostrar "lento"
            ou erro de rede ao lado do gate confundiria a causa real. */}
        {!awaitingLocation && (
          <FeedStates
            isOffline={isOffline}
            isSlow={isSlow}
            error={error}
            hasReports={hasReports}
            onRetry={refresh}
          />
        )}

        {awaitingLocation ? (
          <FeedLocationGate status={geoStatus} onRequest={requestLocation} />
        ) : loading && !hasReports ? (
          <FeedSkeleton count={3} />
        ) : (isOffline || error) && !hasReports ? (
          <FeedFatalState isOffline={isOffline} error={error} onRetry={refresh} />
        ) : !hasReports ? (
          <FeedEmptyState
            tab={activeTab}
            onCreateReport={handleOpenCreate}
            onChangeTab={handleTabChange}
          />
        ) : (
          // key por aba: sem ela o CSS nao reexecuta a animacao, porque para o
          // React e o mesmo elemento apenas com filhos diferentes.
          <div
            key={activeTab}
            className={`space-y-4 ${tabDirection === 'forward' ? 'tc-tab-from-right' : 'tc-tab-from-left'}`}
          >
            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-content-secondary">
                <TromboneSpinner size={14} />
                Atualizando…
              </div>
            )}

            {reports.map((report, index) => (
              <React.Fragment key={report.id}>
                <FeedCard
                  report={report}
                  onToggleUpvote={toggleUpvote}
                  onRequestUpdate={setUpdateTarget}
                  onRequestStory={setStoryTarget}
                  isNew={report.id === recentCreatedId}
                  index={index}
                />
                {index === 0 && <SuggestedProfiles cityId={activeCityId} limit={4} />}
              </React.Fragment>
            ))}

            <div ref={sentinelRef} className="h-4" />

            {!isOffline && <FeedLoadMoreError error={loadMoreError} onRetry={loadMore} />}

            {isSlowMore && (
              <div className="flex items-center justify-center gap-2 text-xs text-content-secondary py-2">
                <TromboneSpinner size={14} />
                Carregando mais… (conexão lenta)
              </div>
            )}

            {loadingMore && (
              <div className="flex justify-center py-4">
                <TromboneSpinner size={24} className="text-content-secondary" />
              </div>
            )}

            {!hasMore && hasReports && (
              <p className="text-center text-xs text-content-secondary py-4">
                Você viu todas as broncas desta categoria.
              </p>
            )}
          </div>
        )}
          </div>
        </main>

        {/* Somente os dois cards de contexto ficam fixos. O restante da lateral
            continua no fluxo normal, para que um bloco alto não desative o sticky. */}
        <aside
          className="hidden lg:col-start-2 lg:block lg:self-stretch 2xl:col-start-3"
          aria-label="Atalhos do feed"
        >
          <div
            ref={rightSidebarRef}
            className="space-y-4 lg:fixed lg:top-20 lg:z-10 lg:max-h-[calc(100dvh-6rem)] lg:w-[19rem] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:scrollbar-none xl:w-[20rem] 2xl:w-[21rem]"
            style={{ right: 'max(1.5rem, calc((100vw - 100rem) / 2 + 1.5rem))', transform: `translateY(-${sidebarShift.right}px)` }}
          >
          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-extrabold text-content-primary">Explore {cityLabel}</h2>
            <p className="mt-1 text-sm leading-5 text-content-secondary">
              Veja onde estão as broncas e consulte os alertas que afetam a rotina da cidade.
            </p>

            <div className="mt-4 space-y-2">
              <Link
                to="/mapa"
                className="group flex items-center justify-between rounded-xl border border-edge-subtle px-3.5 py-3 text-sm font-bold text-content-primary transition hover:border-brand/30 hover:bg-brand/5"
              >
                <span className="flex items-center gap-2.5">
                  <Megaphone className="h-4 w-4 text-brand" aria-hidden="true" />
                  Mapa de broncas
                </span>
                <ArrowRight className="h-4 w-4 text-content-tertiary transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                to="/agora"
                className="group flex items-center justify-between rounded-xl border border-edge-subtle px-3.5 py-3 text-sm font-bold text-content-primary transition hover:border-brand/30 hover:bg-brand/5"
              >
                <span className="flex items-center gap-2.5">
                  <Radio className="h-4 w-4 text-brand" aria-hidden="true" />
                  Radar da cidade
                </span>
                <ArrowRight className="h-4 w-4 text-content-tertiary transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
          </section>

          {/* O cartão só existe quando há alerta. Um "nada acontecendo agora"
              permanente ocuparia a lateral inteira para não dizer nada — e nesta
              página o vazio já tem dono: o feed. */}
          {eventosDoRadar.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
              <div className="px-5 pb-3 pt-5">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-content-primary">
                  <Radio className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  Acontecendo agora
                </h2>
                <p className="mt-1 text-xs leading-5 text-content-secondary">
                  Falta de água, rua interditada, energia programada.
                </p>
              </div>

              <div className="divide-y divide-edge-subtle border-t border-edge-subtle">
                {eventosDoRadar.map((evento) => (
                  <CityEventCard
                    key={evento.id}
                    evento={evento}
                    agora={agora}
                    compact
                    mostrarSelo={false}
                  />
                ))}
              </div>

              <Link
                to="/agora"
                className="group flex items-center justify-center gap-1.5 border-t border-edge-subtle px-5 py-3 text-xs font-bold text-brand transition hover:bg-brand/5"
              >
                Ver todos os alertas
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </section>
          )}
          </div>

        </aside>
      </div>

      <FeedUpdateModal
        open={!!updateTarget}
        onClose={() => setUpdateTarget(null)}
        report={updateTarget}
        onStatusChange={() => refresh({ preserve: true })}
      />

      {storyTarget && (
        <React.Suspense fallback={null}>
          <ReportStoryModal
            isOpen={!!storyTarget}
            onClose={() => setStoryTarget(null)}
            report={storyTarget}
            coverPhotoUrl={storyTarget.coverImage}
          />
        </React.Suspense>
      )}

      {/* ── Report Modal ── */}
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={createReport}
        />
      )}
    </div>
  );
}
