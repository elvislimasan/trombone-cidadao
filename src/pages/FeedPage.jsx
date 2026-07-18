import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw, Loader2, Megaphone, Heart, UserPlus, WifiOff, AlertTriangle, MapPin, ChevronDown, LocateFixed, Globe, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { useFeed } from '@/hooks/useFeed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import FeedCard from '@/components/FeedCard';
import FeedSkeleton from '@/components/FeedSkeleton';
import FeedEmptyState from '@/components/FeedEmptyState';
import ReportModal from '@/components/ReportModal';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const TABS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'trending', label: 'Em alta' },
  { key: 'resolved', label: 'Resolvidas' },
];

const STORAGE_KEYS = {
  reportsSubmitted: 'tc_reports_submitted_count',
};

const readInt = (value, fallback = 0) => {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.trunc(n);
  return fallback;
};

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

const AnimatedNumber = ({ value, durationMs = 650, className = '' }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, value]);

  return <span className={className}>{display}</span>;
};

export default function FeedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCityId, activeCityName, setActiveCity, cities, loadingCities } = useCity();
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const cityPickerRef = useRef(null);
  const { toast } = useToast();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('recent');
  const [showReportModal, setShowReportModal] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [recentCreatedId, setRecentCreatedId] = useState(null);
  const recentCreatedTimerRef = useRef(null);
  const preloadedImagesRef = useRef(new Set());
  const [submittedCount, setSubmittedCount] = useState(() => {
    try {
      return readInt(localStorage.getItem(STORAGE_KEYS.reportsSubmitted), 0);
    } catch {
      return 0;
    }
  });

  const {
    reports,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    toggleUpvote,
    error,
    isSlow,
    loadMoreError,
    isSlowMore,
  } = useFeed(activeTab, activeCityId);
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Sentinel for infinite scroll
  const sentinelRef = useInfiniteScroll(loadMore, {
    enabled: !loading && !loadingMore && hasMore && !loadMoreError,
  });

  // Realtime: count new reports since page load
  const loadedAtRef = useRef(new Date().toISOString());
  useEffect(() => {
    const channel = supabase
      .channel('feed-new-reports')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reports',
          filter: `moderation_status=eq.approved`,
        },
        (payload) => {
          if (payload.new?.created_at >= loadedAtRef.current) {
            setNewCount((n) => n + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setNewCount(0);
    loadedAtRef.current = new Date().toISOString();
    refresh({ preserve: true });
  }, [refresh]);

  useEffect(() => {
    const onReportsUpdated = (e) => {
      const createdId = e?.detail?.id || null;
      setActiveTab('recent');
      setNewCount(0);
      loadedAtRef.current = new Date().toISOString();
      refresh({ preserve: true });
      if (createdId) {
        setRecentCreatedId(createdId);
        if (recentCreatedTimerRef.current) {
          clearTimeout(recentCreatedTimerRef.current);
        }
        recentCreatedTimerRef.current = setTimeout(() => {
          setRecentCreatedId(null);
        }, 8000);
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
  }, [refresh]);

  useEffect(() => {
    const urls = (reports || [])
      .map((r) => r?.coverImage)
      .filter(Boolean)
      .slice(0, 6);

    for (const url of urls) {
      if (preloadedImagesRef.current.has(url)) continue;
      preloadedImagesRef.current.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }, [reports]);

  // Fecha o city picker ao clicar fora
  useEffect(() => {
    if (!cityPickerOpen) return;
    const handler = (e) => {
      if (cityPickerRef.current && !cityPickerRef.current.contains(e.target)) {
        setCityPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [cityPickerOpen]);

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
    setNewCount(0);
    setRecentCreatedId(null);
  }, []);

  const handleCreateReport = useCallback(
    async (newReportData, uploadMediaCallback) => {
      if (!user) return;
      const {
        title, description, category, address, location,
        pole_number, pole_id, reported_pole_distance_m,
        issue_type, reported_post_identifier, reported_plate,
        is_from_water_utility,
        is_anonymous,
        city_id: geocodedCityId,
      } = newReportData;

      const normPole = (raw) =>
        String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

      // city_id: prefer geocode result; fallback to author's profile city
      const cityId = geocodedCityId ?? user?.city_id ?? null;

      const { data, error } = await supabase
        .from('reports')
        .insert({
          title,
          description,
          category_id: category,
          address,
          location: `POINT(${location.lng} ${location.lat})`,
          author_id: user.id,
          protocol: `TROMB-${Date.now()}`,
          pole_number: category === 'iluminacao' ? pole_number : null,
          pole_id: category === 'iluminacao' ? pole_id : null,
          reported_post_identifier:
            category === 'iluminacao'
              ? normPole(reported_post_identifier) || normPole(pole_number) || null
              : null,
          reported_plate:
            category === 'iluminacao'
              ? normPole(reported_plate) || normPole(pole_number) || null
              : null,
          reported_pole_distance_m:
            category === 'iluminacao' ? reported_pole_distance_m : null,
          issue_type: category === 'iluminacao' ? (issue_type?.trim() || null) : null,
          is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
          is_anonymous: !!is_anonymous,
          status: 'pending',
          moderation_status: user?.is_admin ? 'approved' : 'pending_approval',
          city_id: cityId,
        })
        .select('id')
        .single();

      if (error) {
        toast({ title: 'Erro ao criar bronca', description: error.message, variant: 'destructive' });
        return;
      }

      if (uploadMediaCallback) {
        try {
          await uploadMediaCallback(data.id);
        } catch (uploadError) {
          await supabase.from('reports').delete().eq('id', data.id);
          throw uploadError;
        }
      }

      const nextSubmitted = submittedCount + 1;
      setSubmittedCount(nextSubmitted);
      try {
        localStorage.setItem(STORAGE_KEYS.reportsSubmitted, String(nextSubmitted));
      } catch {}

      if (Capacitor.isNativePlatform()) {
        try {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } catch {}
      }
      try {
        confetti({
          particleCount: 90,
          spread: 60,
          origin: { y: 0.25 },
          colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6'],
        });
      } catch {}

      toast({
        title: 'Você acabou de ajudar sua cidade 🔥',
        description: (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Bronca enviada.</span>
            <span className="text-muted-foreground">
              Total: <AnimatedNumber value={nextSubmitted} className="font-semibold text-foreground" />
            </span>
          </span>
        ),
        duration: 4500,
      });
      setShowReportModal(false);
      window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: data.id } }));
    },
    [submittedCount, user, toast]
  );

  const handleOpenCreate = useCallback(() => {
    setShowReportModal(true);
  }, []);

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
      toast({ title: 'Link copiado!', description: 'Cole e envie para alguém contribuir.' });
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copiado!', description: 'Cole e envie para alguém contribuir.' });
      } catch {
        toast({ title: 'Não foi possível compartilhar', variant: 'destructive' });
      }
    }
  }, [toast]);

  return (
    <div className="min-h-full bg-[#F3F4F6]">

        {activeTab !== 'resolved' && (
          <div className="mb-4 p-3">
            <div className="rounded-2xl border border-red-100 bg-[#FEF2F2] px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                    <p className="text-[11px] font-extrabold tracking-[0.18em] text-primary uppercase">
                      Bem-vindo
                    </p>
                  </div>
                  <p className="mt-1 text-base font-extrabold tracking-tight text-foreground">
                    Ajude a melhorar a cidade
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cadastre broncas, apoie petições e convide alguém para contribuir.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="rounded-2xl border-2 border-primary/30 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-primary/50 transition-colors"
                >
                  <div className="mx-auto w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
                    Cadastre sua bronca
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/abaixo-assinados')}
                  className="rounded-2xl border-2 border-orange-200 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="mx-auto w-9 h-9 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center">
                    <Heart className="w-5 h-5" />
                  </div>
                  <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
                    Petições
                  </p>
                </button>

                <button
                  type="button"
                  onClick={handleInvite}
                  className="rounded-2xl border-2 border-blue-200 bg-white px-2.5 py-2.5 text-center shadow-sm hover:border-blue-300 transition-colors"
                >
                  <div className="mx-auto w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <p className="mt-2 text-[11px] font-bold leading-snug text-foreground">
                    Convide alguém
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}
      {/* ── Sticky Tab Bar + City Picker ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto max-w-2xl px-3">

          {/* Seletor de cidade */}
          <div className="pt-2 pb-1 relative" ref={cityPickerRef}>
            <button
              type="button"
              onClick={() => { setCityPickerOpen(v => !v); setCitySearch(''); }}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <MapPin className="h-3 w-3 shrink-0 text-primary" />
              <span className="max-w-[180px] truncate">
                {activeCityName ?? 'Todas as cidades'}
              </span>
              <ChevronDown className={`h-3 w-3 shrink-0 opacity-60 transition-transform ${cityPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {cityPickerOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
                {/* Busca */}
                <div className="flex items-center gap-2 p-2 border-b border-border">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar cidade..."
                    value={citySearch}
                    onChange={e => setCitySearch(e.target.value)}
                    className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  {citySearch && (
                    <button type="button" onClick={() => setCitySearch('')} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto">
                  {/* GPS */}
                  <button
                    type="button"
                    disabled={gpsLoading}
                    onClick={() => {
                      if (!navigator.geolocation || gpsLoading) return;
                      setGpsLoading(true);
                      navigator.geolocation.getCurrentPosition(
                        async ({ coords }) => {
                          try {
                            const res = await fetch(
                              `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
                            );
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            const json = await res.json();
                            const { name, uf } = parseCityFromNominatim(json.address || {});
                            const found = matchCityInList(cities, name, uf);
                            if (found) {
                              setActiveCity(found.id);
                              setCityPickerOpen(false);
                            } else {
                              toast({ title: 'Cidade não encontrada', description: name ? `"${name}" não está no cadastro. Escolha manualmente.` : 'Escolha manualmente na lista.', duration: 4000 });
                            }
                          } catch {
                            toast({ title: 'Erro ao obter localização', description: 'Verifique sua conexão e tente novamente.', duration: 4000 });
                          } finally {
                            setGpsLoading(false);
                          }
                        },
                        (err) => {
                          setGpsLoading(false);
                          const denied = err?.code === 1;
                          toast({
                            title: denied ? 'Localização bloqueada' : 'Não foi possível obter localização',
                            description: denied
                              ? 'Permita o acesso à localização nas configurações do navegador.'
                              : 'Verifique se a localização está ativada e tente novamente.',
                            duration: 5000,
                          });
                        },
                        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
                      );
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-muted transition-colors"
                  >
                    {gpsLoading
                      ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      : <LocateFixed className="h-4 w-4 shrink-0" />
                    }
                    {gpsLoading ? 'Detectando...' : 'Usar minha localização'}
                  </button>

                  {/* Todas as cidades */}
                  <button
                    type="button"
                    onClick={() => { setActiveCity(null); setCityPickerOpen(false); setCitySearch(''); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted border-t border-border/50 transition-colors"
                  >
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                    Todas as cidades
                    {!activeCityId && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>

                  {/* Lista de cidades */}
                  {loadingCities ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    cities
                      .filter(c => {
                        if (!citySearch.trim()) return true;
                        const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
                        const term = norm(citySearch.trim());
                        return norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term.toLowerCase());
                      })
                      .slice(0, citySearch.trim() ? undefined : 50)
                      .map(city => {
                        const isActive = String(activeCityId) === String(city.id);
                        return (
                          <button
                            key={city.id}
                            type="button"
                            onClick={() => { setActiveCity(city.id); setCityPickerOpen(false); setCitySearch(''); }}
                            className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-muted border-t border-border/50 transition-colors ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}
                          >
                            <span className="flex-1 truncate">
                              {city.name}
                              {city.state?.uf && <span className="ml-1 text-xs text-muted-foreground">{city.state.uf}</span>}
                            </span>
                            {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 py-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── "X novas broncas" banner ── */}
      <AnimatePresence>
        {newCount > 0 && (
          <motion.div
            key="new-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="sticky top-[52px] z-10 flex justify-center pt-2 px-3"
          >
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-lg"
            >
              <RefreshCw size={13} />
              {newCount === 1
                ? '1 nova bronca — atualizar'
                : `${newCount} novas broncas — atualizar`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Feed Content ── */}
      <div className="container mx-auto max-w-2xl px-3 py-4">
        {isOffline && reports.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <WifiOff className="h-4 w-4" />
            <div>
              <AlertTitle>Sem conexão</AlertTitle>
              <AlertDescription>Conecte-se à internet para carregar o feed.</AlertDescription>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => refresh({ preserve: reports.length > 0 })}
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {isSlow && !isOffline && (
          <Alert className="mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <div>
              <AlertTitle>Conexão lenta</AlertTitle>
              <AlertDescription>
                Estamos tentando carregar as broncas. Se demorar, tente novamente.
              </AlertDescription>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => refresh({ preserve: reports.length > 0 })}
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {error && reports.length > 0 && !isOffline && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <div>
              <AlertTitle>Falha ao atualizar o feed</AlertTitle>
              <AlertDescription>
                {error.message}
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" onClick={() => refresh({ preserve: true })}>
                    Tentar novamente
                  </Button>
                </div>
              </AlertDescription>
            </div>
          </Alert>
        )}

        {loading && reports.length === 0 ? (
          <FeedSkeleton count={3} />
        ) : isOffline && reports.length === 0 ? (
          <div className="py-10">
            <Alert variant="destructive">
              <WifiOff className="h-4 w-4" />
              <div>
                <AlertTitle>Sem conexão</AlertTitle>
                <AlertDescription>
                  Conecte-se à internet para carregar o feed.
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" onClick={() => refresh({ preserve: false })}>
                      Tentar novamente
                    </Button>
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          </div>
        ) : error && reports.length === 0 ? (
          <div className="py-10">
            <Alert variant="destructive">
              <WifiOff className="h-4 w-4" />
              <div>
                <AlertTitle>Não foi possível carregar</AlertTitle>
                <AlertDescription>
                  {error.message}
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" onClick={() => refresh({ preserve: false })}>
                      Tentar novamente
                    </Button>
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          </div>
        ) : reports.length === 0 ? (
          <FeedEmptyState
            tab={activeTab}
            onCreateReport={handleOpenCreate}
            onChangeTab={handleTabChange}
          />
        ) : (
          <div className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Atualizando…
              </div>
            )}

            {reports.map((report, index) => (
              <FeedCard
                key={report.id}
                report={report}
                onToggleUpvote={toggleUpvote}
                isNew={report.id === recentCreatedId}
                index={index}
              />
            ))}

            <div ref={sentinelRef} className="h-4" />

            {loadMoreError && !isOffline && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <div>
                  <AlertTitle>Falha ao carregar mais broncas</AlertTitle>
                  <AlertDescription>
                    {loadMoreError.message}
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" onClick={loadMore}>
                        Tentar novamente
                      </Button>
                    </div>
                  </AlertDescription>
                </div>
              </Alert>
            )}

            {isSlowMore && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 size={14} className="animate-spin" />
                Carregando mais… (conexão lenta)
              </div>
            )}

            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasMore && reports.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">
                Você viu todas as broncas desta categoria.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Report Modal ── */}
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </div>
  );
}
