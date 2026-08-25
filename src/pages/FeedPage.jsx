import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { showAppError } from '@/lib/appError';

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

export default function FeedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCityId } = useCity();

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

  return (
    <div className="min-h-full bg-surface-base">
      {/* O seletor de cidade agora vive no header (Header/MobileHeader): e um
          filtro global, nao um controle desta pagina. O titulo "Feed" e o botao
          "Nova denuncia" sairam — as abas ja identificam a secao, e criar bronca
          continua no FAB do bottom nav e no atalho abaixo. */}
      <FeedWelcomeCard onCreateReport={handleOpenCreate} onInvite={handleInvite} />

      {/* ── Sticky Tab Bar ── */}
      <div className="sticky top-0 z-10 bg-surface-base/90 backdrop-blur-md border-b border-edge-subtle">
        <div className="container mx-auto max-w-2xl px-3">
          <FeedTabs tabs={FEED_TABS} activeTab={activeTab} onChange={handleTabChange} />
        </div>
      </div>

      {/* ── "X novas broncas" banner ── */}
      <FeedNewReportsBanner count={newCount} onRefresh={handleRefresh} />

      {/* ── Feed Content ── */}
      {/* Arrastar na horizontal troca de aba. Fica neste container, e nao na
          pagina toda, para nao capturar arrasto do header nem do bottom nav. */}
      <div className="container mx-auto max-w-2xl px-3 py-4" {...swipeHandlers}>
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
              <FeedCard
                key={report.id}
                report={report}
                onToggleUpvote={toggleUpvote}
                onRequestUpdate={setUpdateTarget}
                onRequestStory={setStoryTarget}
                isNew={report.id === recentCreatedId}
                index={index}
              />
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
