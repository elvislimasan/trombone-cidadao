import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Radio,
} from 'lucide-react';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
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
import { FEED_TABS } from '@/components/feed/FeedTabs';
import FeedSortMenu from '@/components/feed/FeedSortMenu';
import FeedStates, { FeedFatalState, FeedLoadMoreError } from '@/components/feed/FeedStates';
import FeedWelcomeCard from '@/components/feed/FeedWelcomeCard';
import { FeedDesktopMap, FeedDesktopNavigation } from '@/components/feed/FeedDesktopContext';
import FeedLocationGate from '@/components/feed/FeedLocationGate';
import FeedNewReportsBanner from '@/components/feed/FeedNewReportsBanner';
import CityEventCard from '@/components/agora/CityEventCard';
import { useCityEvents } from '@/hooks/useCityEvents';

// Lazy: carrega html-to-image e qrcode, peso que so faz sentido quando o
// usuario abre o card. Um unico modal serve a lista inteira.
const ReportStoryModal = React.lazy(
  () => import('@/components/report/ReportStoryModal')
);

export default function FeedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCityId, activeCityName, activeCity } = useCity();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState(() => { const tab = new URLSearchParams(location.search).get('aba'); return FEED_TABS.some(item => item.key === tab) ? tab : 'recent'; });
  const [showReportModal, setShowReportModal] = useState(false);
  // O modal de atualizacao vive AQUI, nao no card: um so para a lista inteira, e
  // fora da arvore do card — que tem transform (tc-animate-in) e prenderia o
  // position:fixed do modal ao proprio card em vez da janela.
  const [updateTarget, setUpdateTarget] = useState(null);
  const [storyTarget, setStoryTarget] = useState(null);
  const [recentCreatedId, setRecentCreatedId] = useState(null);
  const recentCreatedTimerRef = useRef(null);
  const preloadedImagesRef = useRef(new Set());

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
    const params = new URLSearchParams(location.search);
    params.set('aba', tabKey);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    resetNewCount();
    setRecentCreatedId(null);
  }, [activeTab, resetNewCount, location.pathname, location.search, navigate]);

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

  const cityNotice = eventosDoRadar.length > 0 ? (
    <section className="mt-3 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised lg:hidden" aria-label="Acontecendo na cidade">
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-4 pt-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-content-primary"><Radio className="h-4 w-4 text-brand" aria-hidden="true" />Acontecendo agora</h2>
        <Link to="/agora" className="inline-flex min-h-12 items-center gap-1 text-xs font-semibold text-brand">Ver alertas<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </div>
      <CityEventCard evento={eventosDoRadar[0]} agora={agora} compact mostrarSelo={false} />
    </section>
  ) : null;

  return (
    <div className="min-h-full bg-surface-base">
      <div className="page-shell-fluid feed-desktop-shell grid min-w-0 gap-5 py-4 lg:items-start lg:py-6">
        <FeedDesktopNavigation user={user} onCreateReport={handleOpenCreate} />
        <main className="feed-desktop-main min-w-0">
          <FeedWelcomeCard cityName={activeCityName} cityImage={activeCity?.civic_thumbnail_url} onCreateReport={handleOpenCreate} />

          {/* ── Sticky Tab Bar ── */}
          <div className="sticky z-10 bg-surface-base/95 backdrop-blur-md lg:static" style={{ top: 'calc(var(--header-bar-height) + var(--header-safe-top))' }}>
            <FeedSortMenu activeTab={activeTab} onChange={handleTabChange} />
          </div>

          {/* ── "X novas broncas" banner ── */}
          <FeedNewReportsBanner count={newCount} onRefresh={handleRefresh} />

          {/* ── Feed Content ── */}
          {/* Arrastar na horizontal troca de aba. Fica neste container, e nao na
              pagina toda, para nao capturar arrasto do header nem do bottom nav. */}
          <div id="feed-panel" role="region" aria-labelledby="feed-content-title" tabIndex={0} className="min-w-0 rounded-2xl py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:py-5" {...swipeHandlers}>
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
            cityName={activeCityName}
            showCreateAction={false}
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
                {index === 0 && cityNotice}
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
          {!hasReports && !loading && !error && !isOffline && !awaitingLocation && cityNotice}
          </div>
        </main>

        {/* Somente os dois cards de contexto ficam fixos. O restante da lateral
            continua no fluxo normal, para que um bloco alto não desative o sticky. */}
        <aside
          className="feed-desktop-aside hidden min-w-0 lg:block lg:self-stretch"
          aria-label="Atalhos do feed"
        >
          <div
            className="space-y-4 lg:sticky"
            style={{ top: 'calc(var(--header-bar-height) + var(--header-safe-top) + 1rem)' }}
          >
          <FeedDesktopMap cityLabel={cityLabel} />

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
