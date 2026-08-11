import React, { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, ChevronRight, Heart, Megaphone, List, Map as MapIcon, Filter, Maximize2, Minimize2, X, BarChart3, AlertTriangle, Clock3, Check, Share2, Search, Plus, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import ReportModal from '@/components/ReportModal';
import { supabase } from '@/lib/customSupabaseClient';
import BottomNav from '@/components/BottomNav';
import { useUpvote } from '../hooks/useUpvotes';
import { getBaseAppUrl, getReportShareUrl, getPetitionShareUrl } from '@/lib/shareUtils';
import { getNextSignatureGoal } from '@/lib/utils';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import CitySelector from '@/components/CitySelector';
import { geocodeCity } from '@/lib/geocodeCity';
const ReportList = React.lazy(() => import('@/components/ReportList'));
const RankingSidebar = React.lazy(() => import('@/components/RankingSidebar'));

const MapView = React.lazy(() => import('@/components/MapView'));

const REPORTS_PREVIEW_LIMIT = 250;
const PETITIONS_DONATIONS_CHUNK = 250;

function HomePageImproved() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { cityId: activeCityId, cityName: activeCityName, city: activeCity } = useCityView();
  const { toast } = useToast();
  const { handleUpvote, loading: upvoteLoading } = useUpvote();
  const [showPetitionsUpdate, setShowPetitionsUpdate] = useState(false);
  const [promoModalConfig, setPromoModalConfig] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    totalResolved: 0,
    resolved: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);

  const [petitions, setPetitions] = useState([]);
  const [loadingPetitions, setLoadingPetitions] = useState(true);
  const [reportsPreview, setReportsPreview] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState({ status: 'active', category: 'all' });
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest'
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState('map');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cityFlyTarget, setCityFlyTarget] = useState(null);

  // Centraliza o mapa na cidade ativa (não há lat/lng na tabela cities —
  // mesmo padrão de geocode usado em WorksMapView/PavementMapView).
  useEffect(() => {
    if (!activeCity?.name) { setCityFlyTarget(null); return; }
    let cancelled = false;
    geocodeCity(activeCity.name, activeCity.state?.uf).then((coord) => {
      if (cancelled || !coord) return;
      setCityFlyTarget({ lat: coord.lat, lng: coord.lng, zoom: 13, nonce: Date.now() });
    });
    return () => { cancelled = true; };
  }, [activeCity?.name, activeCity?.state?.uf]);

  const explorerRef = useRef(null);
  const cancelledRef = useRef(false);

  const createReportShareUrl = useMemo(() => {
    const base = getBaseAppUrl();
    return `${base}/?criar_bronca=1`;
  }, []);

  const openCreateReportFlow = useCallback((originUrl = null) => {
    if (user) {
      setShowReportModal(true);
      try {
        const params = new URLSearchParams(location.search || '');
        if (params.has('criar_bronca')) {
          params.delete('criar_bronca');
          const next = params.toString();
          navigate(`${location.pathname || '/'}${next ? `?${next}` : ''}`, { replace: true });
        }
      } catch {}
      return;
    }
    setShowReportModal(true);
    try {
      const params = new URLSearchParams(location.search || '');
      if (params.has('criar_bronca')) {
        params.delete('criar_bronca');
        const next = params.toString();
        navigate(`${location.pathname || '/'}${next ? `?${next}` : ''}`, { replace: true });
      }
    } catch {}
  }, [location.pathname, location.search, navigate, user]);
  const normalizeReportStatus = useCallback((s) => {
    const v = String(s || '').trim().toLowerCase();
    const norm = v.replace(/[\s_]+/g, '-');
    if (norm === 'pendente') return 'pending';
    if (norm === 'resolvido' || norm === 'resolvida') return 'resolved';
    if (norm === 'in-progress' || norm === 'inprogress' || norm === 'em-andamento' || norm === 'andamento') return 'in-progress';
    if (norm === 'pending' || norm === 'resolved') return norm;
    return norm || 'pending';
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

   useEffect(() => {
    const tryOpenPetitionsModal = () => {
      setShowPetitionsUpdate(true);
    };

    const fetchPromoModalConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('site_config')
          .select('promo_modal_settings')
          .eq('id', 1)
          .single();

        if (!error && data?.promo_modal_settings?.petitions_modal) {
          const modalConfig = data.promo_modal_settings.petitions_modal;
          setPromoModalConfig(modalConfig);
          
          // Only show modal if enabled in admin and user hasn't seen it today
          if (modalConfig.enabled) {
            const lastSeen = localStorage.getItem('home-petitions-update-modal-v1');
            const today = new Date().toDateString();
            if (!lastSeen || lastSeen !== today) {
              tryOpenPetitionsModal();
            }
          }
        } else {
          // Fallback: use default behavior if config not available
          const seen = localStorage.getItem('home-petitions-update-modal-v1');
          if (!seen) {
            tryOpenPetitionsModal();
          }
        }
      } catch (err) {
        console.error('Error fetching promo modal config:', err);
        // Fallback to default behavior
        const seen = localStorage.getItem('home-petitions-update-modal-v1');
        if (!seen) {
          tryOpenPetitionsModal();
        }
      }
    };

    fetchPromoModalConfig();
    return () => {
    };
  }, []);

  const handlePetitionsUpdateVisibility = (open) => {
    setShowPetitionsUpdate(open);
    if (!open) {
      localStorage.setItem('home-petitions-update-modal-v1', new Date().toDateString());
    }
  };

  const handleGoToPetitionsOverview = () => {
    localStorage.setItem('home-petitions-update-modal-v1', new Date().toDateString());
    setShowPetitionsUpdate(false);
    navigate(promoModalConfig?.secondary_button_url || '/abaixo-assinados');
  };

  const handleGoToMyPetitions = () => {
    localStorage.setItem('home-petitions-update-modal-v1', new Date().toDateString());
    setShowPetitionsUpdate(false);
    navigate(promoModalConfig?.primary_button_url || '/minhas-peticoes');
  };

  const fetchStats = useCallback(async (retryCount = 0) => {
    setLoadingStats(true);
    try {
      const buildBase = () => {
        let q = supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('moderation_status', 'approved')
          .neq('status', 'duplicate');
        if (activeCityId) q = q.eq('city_id', activeCityId);
        return q;
      };

      const [pendingRes, inProgressRes, resolvedRes, myResolvedRes] = await Promise.all([
        buildBase().eq('status', 'pending'),
        buildBase().eq('status', 'in-progress'),
        buildBase().eq('status', 'resolved'),
        user ? buildBase().eq('status', 'resolved').eq('author_id', user.id) : Promise.resolve({ count: 0, error: null }),
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (inProgressRes.error) throw inProgressRes.error;
      if (resolvedRes.error) throw resolvedRes.error;
      if (myResolvedRes.error) throw myResolvedRes.error;

      const pending = pendingRes.count || 0;
      const inProgress = inProgressRes.count || 0;
      const totalResolved = resolvedRes.count || 0;
      const total = pending + inProgress;
      const userResolved = myResolvedRes.count || 0;

      if (cancelledRef.current) return;
      setStats({ total, pending, inProgress, totalResolved, resolved: userResolved });
    } catch (err) {
      console.error('Erro ao buscar estatísticas da home:', err);
      // 🔥 Retry mechanism para falhas intermitentes
      if (retryCount < 2) {
        setTimeout(() => {
          if (!cancelledRef.current) fetchStats(retryCount + 1);
        }, 2000);
      }
    } finally {
      if (!cancelledRef.current) setLoadingStats(false);
    }
  }, [user, activeCityId]);

  const fetchTopPetitions = useCallback(async (retryCount = 0) => {
    setLoadingPetitions(true);
    try {
      const { data: petitionsData, error: petitionsError } = await supabase
        .from("petitions")
        .select("id, title, description, image_url, goal, created_at, signatures:signatures(count)")
        .eq("status", "open");

      if (petitionsError) {
        throw petitionsError;
      }

      const petitionIds = (petitionsData || []).map((p) => p.id).filter(Boolean);

      const processed = (petitionsData || []).map((p) => ({
        ...p,
        signatureCount: p.signatures?.[0]?.count || 0,
      }));

      let donations = [];
      if (petitionIds.length > 0) {
        for (let i = 0; i < petitionIds.length; i += PETITIONS_DONATIONS_CHUNK) {
          const chunkIds = petitionIds.slice(i, i + PETITIONS_DONATIONS_CHUNK);
          const { data: chunkData, error: chunkError } = await supabase
            .from('donations')
            .select('petition_id, amount')
            .eq('status', 'paid')
            .in('petition_id', chunkIds);
          if (chunkError) throw chunkError;
          donations = donations.concat(chunkData || []);
        }
      }

      const totals = {};
      (donations || []).forEach((d) => {
        const pid = d.petition_id;
        const amount = Number(d.amount) || 0;
        totals[pid] = (totals[pid] || 0) + amount;
      });

      const enriched = processed.map((p) => {
        const donationTotal = totals[p.id] || 0;
        const goal = getNextSignatureGoal(p.signatureCount || 0, p.goal || 100);
        const progress = Math.min(((p.signatureCount || 0) / goal) * 100, 100);
        return {
          ...p,
          donationTotal,
          progress,
        };
      });

      const withDonations = enriched.filter((p) => (p.donationTotal || 0) > 0);

      let ranked;
      if (withDonations.length > 0) {
        ranked = [...withDonations].sort((a, b) => {
          const donationDiff = (b.donationTotal || 0) - (a.donationTotal || 0);
          if (donationDiff !== 0) return donationDiff;
          const signatureDiff = (b.signatureCount || 0) - (a.signatureCount || 0);
          if (signatureDiff !== 0) return signatureDiff;
          return 0;
        });
      } else {
        ranked = [...enriched].sort((a, b) => {
          const signatureDiff = (b.signatureCount || 0) - (a.signatureCount || 0);
          if (signatureDiff !== 0) return signatureDiff;
          return 0;
        });
      }

      if (cancelledRef.current) return;
      setPetitions(ranked.slice(0, 10));
    } catch (err) {
      console.error('Erro ao buscar petições para a home:', err);
      if (retryCount < 2) {
        setTimeout(() => {
          if (!cancelledRef.current) fetchTopPetitions(retryCount + 1);
        }, 2000);
      }
    } finally {
      if (!cancelledRef.current) setLoadingPetitions(false);
    }
  }, []);

  const fetchReportsPreview = useCallback(async (retryCount = 0) => {
    setLoadingReports(true);
    try {
      const wanted = normalizeReportStatus(filter.status);
      const limit = wanted !== 'all' && wanted !== 'active' ? 1000 : REPORTS_PREVIEW_LIMIT;

      let query = supabase
        .from('reports')
        .select(`
          id,
          protocol,
          title,
          description,
          status,
          views,
          is_featured,
          created_at,
          location,
          address,
          category_id,
          is_recurrent,
          author_id,
          category:categories(name, icon),
          upvotes:signatures(count),
          comments_count:comments(count),
          report_media(url, type)
        `)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: sortOrder === 'oldest' });

      if (activeCityId) query = query.eq('city_id', activeCityId);

      if (wanted !== 'all' && wanted !== 'active' && wanted) {
        query = query.eq('status', wanted);
      }

      const { data, error } = await query.limit(limit);

      if (error) {
        throw error;
      }

      const reportIds = (data || []).map((r) => r.id).filter(Boolean);

      let upvotedSet = new Set();
      let favoritesSet = new Set();

      if (user && reportIds.length > 0) {
        const [upvotesRes, favRes] = await Promise.all([
          supabase.from('signatures').select('report_id').eq('user_id', user.id).in('report_id', reportIds),
          supabase.from('favorite_reports').select('report_id').eq('user_id', user.id).in('report_id', reportIds),
        ]);

        if (upvotesRes.error) throw upvotesRes.error;
        if (favRes.error) throw favRes.error;

        upvotedSet = new Set((upvotesRes.data || []).map((row) => row.report_id));
        favoritesSet = new Set((favRes.data || []).map((row) => row.report_id));
      }

      const formatted = (data || []).map((r) => ({
        ...r,
        location: r.location
          ? { lat: r.location.coordinates[1], lng: r.location.coordinates[0] }
          : null,
        category: r.category_id,
        categoryName: r.category?.name,
        categoryIcon: r.category?.icon,
        coverImage: (r.report_media || []).find((m) => m.type === 'photo')?.url || null,
        upvotes: r.upvotes?.[0]?.count || 0,
        comments_count: r.comments_count?.[0]?.count || 0,
        user_has_upvoted: user ? upvotedSet.has(r.id) : false,
        is_favorited: user ? favoritesSet.has(r.id) : false,
      }));

      if (cancelledRef.current) return;
      setReportsPreview(formatted);
    } catch (err) {
      console.error('Erro ao buscar broncas para o mapa da home:', err);
      if (retryCount < 2) {
        setTimeout(() => {
          if (!cancelledRef.current) fetchReportsPreview(retryCount + 1);
        }, 2000);
      }
    } finally {
      if (!cancelledRef.current) setLoadingReports(false);
    }
  }, [user, sortOrder, filter.status, normalizeReportStatus, activeCityId]);

  const fetchCategories = useCallback(async (retryCount = 0) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, icon');

      if (error) {
        throw error;
      }

      if (cancelledRef.current) return;
      setCategories(data || []);
    } catch (err) {
      console.error('Erro ao buscar categorias:', err);
      if (retryCount < 2) {
        setTimeout(() => {
          if (!cancelledRef.current) fetchCategories(retryCount + 1);
        }, 2000);
      }
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchTopPetitions();
    fetchReportsPreview();
    fetchCategories();
  }, [fetchStats, fetchTopPetitions, fetchReportsPreview, fetchCategories]);

  useEffect(() => {
    const onReportsUpdated = () => {
      fetchStats();
      fetchReportsPreview();
    };
    window.addEventListener('reports-updated', onReportsUpdated);
    return () => window.removeEventListener('reports-updated', onReportsUpdated);
  }, [fetchReportsPreview, fetchStats]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const statusFilteredReports = useMemo(() => {
    let tempReports = reportsPreview.filter((r) => r.status !== 'duplicate');
    const wanted = normalizeReportStatus(filter.status);

    if (wanted === 'active') {
      tempReports = tempReports.filter(
        (r) => {
          const st = normalizeReportStatus(r.status);
          return st === 'pending' || st === 'in-progress';
        }
      );
    } else if (wanted === 'my-resolved') {
      tempReports = tempReports.filter(
        (r) => normalizeReportStatus(r.status) === 'resolved' && user && r.author_id === user.id
      );
    } else if (wanted === 'resolved') {
      tempReports = tempReports.filter((r) => normalizeReportStatus(r.status) === 'resolved');
    } else if (wanted !== 'all') {
      tempReports = tempReports.filter((r) => normalizeReportStatus(r.status) === wanted);
    }

    return tempReports;
  }, [reportsPreview, filter.status, user, normalizeReportStatus]);

  const statusCounts = useMemo(() => {
    let items = (reportsPreview || []).filter((r) => r.status !== 'duplicate');
    if (filter.category !== 'all') {
      items = items.filter((r) => r.category_id === filter.category);
    }
    if (viewMode === 'map') {
      items = items.filter((r) => r.location && typeof r.location.lat === 'number' && typeof r.location.lng === 'number');
    }
    const pending = items.filter((r) => normalizeReportStatus(r.status) === 'pending').length;
    const inProgress = items.filter((r) => normalizeReportStatus(r.status) === 'in-progress').length;
    const resolved = items.filter((r) => normalizeReportStatus(r.status) === 'resolved').length;
    const total = items.length;
    const active = pending + inProgress;
    const myResolved = user ? items.filter((r) => normalizeReportStatus(r.status) === 'resolved' && r.author_id === user.id).length : 0;
    return { total, pending, inProgress, resolved, active, myResolved };
  }, [reportsPreview, user, viewMode, filter.category, normalizeReportStatus]);

  const categoryCounts = useMemo(() => {
    const map = {};
    statusFilteredReports.forEach((r) => {
      const k = r.category_id;
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [statusFilteredReports]);

  const filteredReports = useMemo(() => {
    let tempReports = statusFilteredReports;

    if (filter.category !== 'all') {
      tempReports = tempReports.filter((r) => r.category_id === filter.category);
    }

    const term = debouncedSearchTerm.trim().toLowerCase();
    if (term) {
      tempReports = tempReports.filter((r) => {
        const title = r.title ? r.title.toLowerCase() : '';
        const protocol = r.protocol ? String(r.protocol).toLowerCase() : '';
        return title.includes(term) || protocol.includes(term);
      });
    }

    if (viewMode === 'map') {
      tempReports = tempReports.filter(
        (r) => r.location && typeof r.location.lat === 'number' && typeof r.location.lng === 'number'
      );
    }

    return tempReports;
  }, [debouncedSearchTerm, filter.category, statusFilteredReports, viewMode]);

  // MapView consome itens no formato { isCluster, lat, lng, count, report } — sem clustering aqui, cada report vira um pin individual.
  const mapItems = useMemo(() => (
    filteredReports
      .filter(r => r.location)
      .map(r => ({
        isCluster: false,
        lat: r.location.lat,
        lng: r.location.lng,
        count: 1,
        report: r,
      }))
  ), [filteredReports]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filter.status !== 'active') count++;
    if (filter.category !== 'all') count++;
    if (searchTerm.trim()) count++;
    return count;
  }, [filter, searchTerm]);

  const handleExploreMap = () => {
    if (explorerRef.current) {
      explorerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleStatusCardClick = (statusKey) => {
    setFilter((prev) => ({
      ...prev,
      status: statusKey,
      category: 'all',
    }));
    setSearchTerm('');
    setViewMode('map');
    if (explorerRef.current) {
      explorerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const handleReportClick = (report) => {
    if (report?.id) {
      navigate(`/bronca/${report.id}`);
    }
  };

  const handleOpenPetition = (id) => {
    navigate(`/abaixo-assinado/${id}`);
  };

  const handleFeaturedUpvote = async (report, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const res = await handleUpvote(report.id, report.upvotes, report.user_has_upvoted);
    if (res && res.success) {
      setReportsPreview((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? { ...item, upvotes: res.newUpvotes, user_has_upvoted: res.newUserHasUpvoted }
            : item
        )
      );
    }
  };

  const handleShareReport = async (report, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const url = getReportShareUrl(report.id);
    const shareText = `*Trombone Cidadão*\n\n*${report.title || 'Bronca'}*\n\nVeja em:\n${url}`;
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
      try {
        await Share.share({ title: 'Trombone Cidadão', text: shareText });
        toast({ title: 'Compartilhado com sucesso! 📣' });
      } catch {}
      return;
    }
    if (!Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
      window.open(whatsappUrl, '_blank');
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Trombone Cidadão', text: shareText }); } catch {}
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(shareText); toast({ title: 'Texto copiado!' }); } catch {}
    }
  };

  const handleSharePetition = async (petition, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const url = getPetitionShareUrl(petition.id);
    const shareText = `*Trombone Cidadão*\n\n*${petition.title || 'Abaixo-assinado'}*\n\nVeja em:\n${url}`;
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
      try {
        await Share.share({ title: 'Trombone Cidadão', text: shareText });
        toast({ title: 'Compartilhado com sucesso! 📣' });
      } catch {}
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Trombone Cidadão', text: shareText }); } catch {}
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(shareText); toast({ title: 'Texto copiado!' }); } catch {}
    }
  };

  const formatCurrency = (value) => {
    const n = Number(value) || 0;
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    });
  };

  const isDesktopCarousel = petitions.length > 3;
  const featuredReports = useMemo(() => (reportsPreview || []).filter(r => r.is_featured), [reportsPreview]);

  const handleNewReportClick = () => {
    openCreateReportFlow();
  };

  const handleShareCreateReport = useCallback(async () => {
    const url = createReportShareUrl;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: 'Cadastre sua bronca',
          text: 'Acesse e cadastre sua bronca.',
          url,
          dialogTitle: 'Compartilhar',
        });
        return;
      }
      if (navigator?.share) {
        await navigator.share({ title: 'Cadastre sua bronca', text: 'Acesse e cadastre sua bronca.', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado!', description: 'Cole e compartilhe para abrir o formulário direto.' });
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copiado!', description: 'Cole e compartilhe para abrir o formulário direto.' });
      } catch {
        toast({ title: 'Não foi possível compartilhar', variant: 'destructive' });
      }
    }
  }, [createReportShareUrl, toast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const shouldOpen = params.get('criar_bronca') === '1' || params.get('criar_bronca') === 'true';
    if (!shouldOpen) return;
    openCreateReportFlow(`${location.pathname || '/'}${location.search || ''}`);
  }, [location.pathname, location.search, openCreateReportFlow]);

  const handleCreateReport = async (newReportData, uploadMediaCallback) => {
    if (!user) return;

    const { title, description, category, address, location, pole_number, pole_id, reported_pole_distance_m, issue_type, reported_post_identifier, reported_plate, is_from_water_utility, city_id } = newReportData;
    const normalizePoleLabel = (raw) => String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();
    const normalizedPole = normalizePoleLabel(pole_number);
    const savedReportedPostIdentifier = reported_post_identifier ? normalizePoleLabel(reported_post_identifier) : (normalizedPole || null);
    const savedReportedPlate = reported_plate ? normalizePoleLabel(reported_plate) : (normalizedPole || null);

    const { data, error } = await supabase
      .from('reports')
      .insert({
        title,
        description,
        category_id: category,
        address,
        location: `POINT(${location.lng} ${location.lat})`,
        city_id,
        author_id: user.id,
        protocol: `TROMB-${Date.now()}`,
        pole_number: category === 'iluminacao' ? pole_number : null,
        pole_id: category === 'iluminacao' ? pole_id : null,
        reported_post_identifier: category === 'iluminacao' ? savedReportedPostIdentifier : null,
        reported_plate: category === 'iluminacao' ? savedReportedPlate : null,
        reported_pole_distance_m: category === 'iluminacao' ? reported_pole_distance_m : null,
        issue_type: category === 'iluminacao' ? (issue_type?.trim() || null) : null,
        is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
        status: 'pending',
        moderation_status: user?.is_admin ? 'approved' : 'pending_approval',
      })
      .select('id', 'title')
      .single();

    if (error) {
      toast({ title: "Erro ao criar bronca", description: error.message, variant: "destructive" });
      return;
    }

    if (uploadMediaCallback) {
      await uploadMediaCallback(data.id);
    }

    const toastMessage = user?.is_admin
      ? { title: "Bronca criada com sucesso!", description: "Sua bronca foi publicada diretamente." }
      : { title: "Bronca enviada para moderação! 📬", description: "Após aprovada, estará disponível no feed." };

    toast(toastMessage);
    setShowReportModal(false);

    setTimeout(() => {
      fetchReportsPreview();
    }, 1000);
  };

  return (
    <div className=" flex flex-col bg-surface-base md:px-6">
      <div className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-4 space-y-10 max-w-[88rem] mx-auto w-full">
        <section className="space-y-4">
          {/* Fundo neutro em vez do gradiente rosa/branco fixo: no tema escuro
              o titulo ficava branco sobre rosa claro, ilegivel. */}
          <div className="rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1 p-4 md:p-5">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-brand">
              <span className="inline-block w-1 h-3 rounded-full bg-brand" />
              Bem-vindo
            </p>
            <div className="text-lg md:text-xl lg:text-2xl font-extrabold text-content-primary mt-2">
              Ajude a melhorar a cidade
            </div>
            <div className="text-xs lg:text-sm text-content-secondary mt-1">
              Cadastre broncas, apoie petições e convide alguém para contribuir.
            </div>

            <div className="mt-4 flex items-stretch gap-3 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => openCreateReportFlow()}
                className="group shrink-0 w-[120px] h-[120px] rounded-2xl border-2 border-brand/50 bg-surface-raised shadow-sm hover:shadow-md hover:border-brand/70 transition p-3 flex flex-col items-center justify-center gap-2"
              >
                <Megaphone className="w-6 h-6 text-brand" />
                <div className="text-xs font-semibold text-content-primary leading-tight text-center">Cadastre sua bronca</div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/abaixo-assinados')}
                className="group shrink-0 w-[120px] h-[120px] rounded-2xl border-2 border-status-pendingBorder/50 bg-surface-raised shadow-sm hover:shadow-md hover:border-status-pendingBorder/70 transition p-3 flex flex-col items-center justify-center gap-2"
              >
                <Heart className="w-6 h-6 text-status-pendingFg" />
                <div className="text-xs font-semibold text-content-primary leading-tight text-center">Petições</div>
              </button>

              <button
                type="button"
                onClick={handleShareCreateReport}
                className="group shrink-0 w-[120px] h-[120px] rounded-2xl border-2 border-brand/30 bg-surface-raised shadow-sm hover:shadow-md hover:border-brand/50 transition p-3 flex flex-col items-center justify-center gap-2"
              >
                <Share2 className="w-6 h-6 text-brand" />
                <div
                  className="text-[11px] font-semibold text-content-primary leading-tight text-center"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  Convide alguém para contribuir
                </div>
              </button>
            </div>
          </div>
         
           <div className="lg:pt-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-content-primary mb-2">Broncas da Sua Cidade</h1>
              <p className="text-xs lg:text-sm text-content-secondary mb-3">
                Veja os problemas reportados pela comunidade e acompanhe as soluções em tempo real.
              </p>
              <CitySelector />
            </div>
            <div className="hidden md:flex items-center gap-3">
              <Button
                onClick={handleNewReportClick}
                className="bg-tc-red hover:bg-tc-red/90 gap-2 text-tc-white rounded-full px-4 h-9 text-xs lg:h-10 lg:text-sm"
              >
                <Plus className="w-4 h-4" />
                Nova bronca
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleStatusCardClick('active')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 lg:px-6 lg:py-6 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'active'
                  ? 'bg-surface-raised border border-status-progressBorder/60 shadow-md'
                  : 'bg-surface-raised border border-transparent hover:border-status-progressBorder/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-status-progressFg">Ativas</div>
                <div className="text-xl md:text-2xl font-extrabold text-status-progressFg leading-tight">
                  {loadingStats ? '–' : stats.total}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-status-progressFg text-white">
                <BarChart3 className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleStatusCardClick('pending')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'pending'
                  ? 'bg-surface-raised border border-brand/60 shadow-md'
                  : 'bg-surface-raised border border-transparent hover:border-brand/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-brand">Pendentes</div>
                <div className="text-xl md:text-2xl font-extrabold text-brand leading-tight">
                  {loadingStats ? '–' : stats.pending}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-brand text-white">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleStatusCardClick('in-progress')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'in-progress'
                  ? 'bg-surface-raised border border-status-pendingBorder/60 shadow-md'
                  : 'bg-surface-raised border border-transparent hover:border-status-pendingBorder/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-status-pendingFg">Em Andamento</div>
                <div className="text-xl md:text-2xl font-extrabold text-status-pendingFg leading-tight">
                  {loadingStats ? '–' : stats.inProgress}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-status-pendingFg text-white">
                <Clock3 className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleStatusCardClick('resolved')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'resolved'
                  ? 'bg-surface-raised border border-status-resolvedBorder/60 shadow-md'
                  : 'bg-surface-raised border border-transparent hover:border-status-resolvedBorder/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-status-resolvedFg">Resolvidas</div>
                <div className="text-xl md:text-2xl font-extrabold text-status-resolvedFg leading-tight">
                  {loadingStats ? '–' : stats.totalResolved}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-status-resolvedFg text-white">
                <Check className="w-4 h-4" />
              </div>
            </button>
          </div>

         
        </section>

        <section ref={explorerRef} className="space-y-4">
          <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                    <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                    Explorar
                  </p>
                  <h2 className="text-sm md:text-base lg:text-md font-semibold text-content-primary">
                    Broncas{activeCityName ? ` em ${activeCityName}` : ''}
                  </h2>
                </div>
                <div className="inline-flex items-center rounded-full bg-surface-raised border border-edge-subtle p-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs md:text-sm ${
                      viewMode === 'map'
                        ? 'bg-surface-sunken text-white'
                        : 'text-content-secondary'
                    }`}
                  >
                    <MapIcon className="w-3 h-3" />
                    Mapa
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs md:text-sm ${
                      viewMode === 'list'
                        ? 'bg-surface-sunken text-white'
                        : 'text-content-secondary'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    Lista
                  </button>
                    <button
                    type="button"
                    onClick={() => {
                      setViewMode('ranking');
                    }}
                    className={`lg:hidden sm:flex items-center gap-1 px-2 py-1 rounded-full text-xs md:text-sm ${
                      viewMode === 'ranking'
                        ? 'bg-surface-sunken text-white'
                        : 'text-content-secondary'
                    }`}
                  >
                    Ranking
                  </button>
                </div>
                  
              </div>

        
          
          <div className="grid lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8 space-y-4">
              

             {viewMode !== 'ranking' && ( 
              <div className="bg-surface-raised rounded-2xl border border-edge-subtle shadow-sm p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {viewMode === 'list' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full border-edge-subtle text-content-secondary bg-surface-raised"
                            title="Ordenar por data"
                          >
                            <ArrowUpDown className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuRadioGroup value={sortOrder} onValueChange={setSortOrder}>
                            <DropdownMenuRadioItem value="newest">Mais Recentes</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="oldest">Mais Antigas</DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  
                    {viewMode !== 'list' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full border-edge-subtle text-content-secondary bg-surface-raised"
                      >
                        <Filter className="w-4 h-4" />
                      </Button>
                    )}
                    {!searchOpen && (
                      <span className="text-[11px] text-content-secondary">
                        {activeFiltersCount > 0
                          ? `${activeFiltersCount} filtro${activeFiltersCount > 1 ? 's' : ''} ativos`
                          : 'Todas as broncas ativas'}
                      </span>
                    )}
                  </div>
               
                  <div className="flex items-center gap-2">
                         {/* Botão de busca compacto à esquerda dos filtros */}
                    {!searchOpen ? (
                      <button
                        type="button"
                        onClick={() => setSearchOpen(true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised border border-edge-subtle shadow-sm text-content-secondary"
                        aria-label="Abrir busca"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary" />
                          <Input
                            type="text"
                            placeholder="Título ou protocolo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-7 h-8 text-xs md:text-sm bg-surface-raised border-edge-subtle w-40 sm:w-60"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchTerm('');
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised border border-edge-subtle shadow-sm text-content-secondary"
                          aria-label="Fechar busca"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {viewMode !== 'list' && (
                      <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="relative h-8 px-3 rounded-full text-[11px] border-edge-subtle text-content-secondary bg-surface-raised"
                          >
                            Filtros
                            {activeFiltersCount > 0 && (
                              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-tc-red text-white text-[10px] leading-none">
                                {activeFiltersCount}
                              </span>
                            )}
                          </Button>
                          
                        </DialogTrigger>
                        
                        {/* Filtros + Busca compacta no diálogo */}
                        <DialogContent
                          hideClose
                          className="w-full max-w-[480px] sm:max-w-md p-0 rounded-t-2xl sm:rounded-lg left-1/2 -translate-x-1/2 top-auto bottom-0 translate-y-0 sm:top-1/2 sm:-translate-y-1/2"
                        >
                        <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b">
                          <DialogTitle className="text-base font-semibold">
                            Filtros
                          </DialogTitle>
                          <div className="flex items-center gap-2">
                            {activeFiltersCount > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setFilter({ status: 'active', category: 'all' });
                                  setSearchTerm('');
                                }}
                                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-tc-red hover:bg-muted/60 rounded-full"
                              >
                                Limpar
                              </Button>
                            )}
                            <DialogClose asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </DialogClose>
                          </div>
                        </DialogHeader>
                        <div className="px-4 py-3 space-y-4 max-h-[65vh] overflow-y-auto">
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                              <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                              Buscar
                            </p>
                            <div className="relative mt-2">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                              <Input
                                type="text"
                                placeholder="Título ou protocolo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-9 text-sm bg-surface-raised border-edge-subtle"
                              />
                            </div>
                          </div>
                          {/* <div>
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                              <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                              Ordenar
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setSortOrder('newest')}
                                className={`px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                                  sortOrder === 'newest'
                                    ? 'border-tc-red bg-surface-subtle text-content-primary font-medium'
                                    : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-subtle'
                                }`}
                              >
                                Mais Recentes
                              </button>
                              <button
                                type="button"
                                onClick={() => setSortOrder('oldest')}
                                className={`px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                                  sortOrder === 'oldest'
                                    ? 'border-tc-red bg-surface-subtle text-content-primary font-medium'
                                    : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-subtle'
                                }`}
                              >
                                Mais Antigas
                              </button>
                            </div>
                          </div> */}
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                              <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                              Status
                            </p>
                            <div className="mt-2 space-y-2">
                              <button
                                type="button"
                                onClick={() => setFilter((f) => ({ ...f, status: 'pending' }))}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                  filter.status === 'pending'
                                    ? 'border-tc-red bg-surface-subtle text-content-primary'
                                    : 'border-edge-subtle bg-surface-raised text-content-secondary'
                                }`}
                              >
                                Pendentes ({statusCounts.pending})
                              </button>
                              <button
                                type="button"
                                onClick={() => setFilter((f) => ({ ...f, status: 'in-progress' }))}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                  filter.status === 'in-progress'
                                    ? 'border-tc-red bg-surface-subtle text-content-primary'
                                    : 'border-edge-subtle bg-surface-raised text-content-secondary'
                                }`}
                              >
                                Em Andamento ({statusCounts.inProgress})
                              </button>
                              <button
                                type="button"
                                onClick={() => setFilter((f) => ({ ...f, status: 'resolved' }))}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                  filter.status === 'resolved'
                                    ? 'border-tc-red bg-surface-subtle text-content-primary'
                                    : 'border-edge-subtle bg-surface-raised text-content-secondary'
                                }`}
                              >
                                Resolvidas ({statusCounts.resolved})
                              </button>
                              {user && (
                                <button
                                  type="button"
                                  onClick={() => setFilter((f) => ({ ...f, status: 'my-resolved' }))}
                                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                    filter.status === 'my-resolved'
                                      ? 'border-tc-red bg-surface-subtle text-content-primary'
                                      : 'border-edge-subtle bg-surface-raised text-content-secondary'
                                  }`}
                                >
                                  Minhas Resolvidas ({statusCounts.myResolved})
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                              <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                              Categoria
                            </p>
                            <div className="mt-2 space-y-2">
                              {categories.map((cat) => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setFilter((f) => ({ ...f, category: cat.id }))}
                                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm ${
                                    filter.category === cat.id
                                      ? 'border-tc-red bg-surface-subtle text-content-primary'
                                      : 'border-edge-subtle bg-surface-raised text-content-secondary'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-base flex-shrink-0">{cat.icon}</span>
                                    <span className="truncate">{cat.name}</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {categoryCounts[cat.id] || 0}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-3 border-t bg-surface-raised">
                          <Button
                            className="w-full h-10 text-sm font-semibold bg-tc-red hover:bg-tc-red/90 rounded-full"
                            onClick={() => setMobileFiltersOpen(false)}
                          >
                            Aplicar Filtros
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  {viewMode !== 'list' && (
                    <button
                      type="button"
                      onClick={() => setMapExpanded((prev) => !prev)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised border border-edge-subtle shadow-sm text-content-secondary"
                    >
                      {mapExpanded ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  </div>
                </div> 



                {viewMode === 'map' ? (
                  <>
                    <motion.div
                      key={viewMode === 'ranking'? 'ranking-mobile' : 'map-mobile'}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="md:hidden"
                    >
                      
                        <div
                          className={`relative rounded-2xl overflow-hidden border border-edge-subtle bg-surface-raised transition-[height] duration-200 mt-2 ${
                            mapExpanded ? 'h-[26rem]' : 'h-[18rem]'
                          }`}
                        >
                          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground bg-surface-raised">Carregando mapa...</div>}>
                            <MapView
                              clusters={mapItems}
                              onReportClick={handleReportClick}
                              onUpvote={() => {}}
                              showLegend
                              interactive
                              flyToTarget={cityFlyTarget}
                            />
                          </Suspense>
                        </div>
                    
                    </motion.div>

                    <div className="hidden md:block">
                      <div
                        className={`relative rounded-2xl overflow-hidden border border-edge-subtle transition-[height] duration-200 mt-2 ${
                          mapExpanded ? 'h-[30rem] xl:h-[32rem]' : 'h-[28rem] xl:h-[28rem]'
                        }`}
                      >
                        <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground bg-surface-raised">Carregando mapa...</div>}>
                          <MapView
                            clusters={mapItems}
                            onReportClick={handleReportClick}
                            onUpvote={() => {}}
                            showLegend
                            interactive
                            flyToTarget={cityFlyTarget}
                          />
                        </Suspense>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="max-h-[26rem] md:max-h-[30rem] xl:max-h-[32rem] overflow-y-auto -mx-1 px-1 mt-2" style={{ contentVisibility: 'auto', containIntrinsicSize: '600px' }}>
                    <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Carregando lista...</div>}>
                      <ReportList reports={filteredReports} onReportClick={handleReportClick} />
                    </Suspense>
                  </div>
                )}
              </div> )}
            </div>

            <aside className="hidden lg:block lg:col-span-4">
              <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Carregando ranking...</div>}>
                <RankingSidebar reports={reportsPreview} onReportClick={handleReportClick} />
              </Suspense>
            </aside>
          </div>
        </section>
       { viewMode === 'ranking' && (
                        <div className="rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm overflow-hidden mt-2">
                          <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">Carregando ranking...</div>}>
                            <RankingSidebar
                              embedded
                              reports={reportsPreview}
                              onReportClick={handleReportClick}
                            />
                          </Suspense>
                        </div>)}

        {featuredReports.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                  <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                  Destaques
                </p>
                <h2 className="text-lg md:text-2xl font-bold text-content-primary">Broncas em Destaque</h2>
                <p className="text-xs md:text-sm text-content-secondary">Acompanhe as principais broncas.</p>
              </div>
            </div>
            <Carousel className="w-full" opts={{ align: 'start', loop: true }}>
              <CarouselContent className="-ml-3">
                {featuredReports.map((r) => (
                  <CarouselItem
                    key={r.id}
                    className="pl-3 basis-[85%] sm:basis-[60%] md:basis-1/2 lg:basis-1/3"
                  >
                    <div
                      className="h-full bg-surface-raised border border-edge-subtle rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition"
                      onClick={() => handleReportClick(r)}
                      role="button"
                    >
                      <div className="relative h-36 md:h-40 w-full">
                        {r.coverImage ? (
                          <img
                            src={r.coverImage}
                            alt={r.title}
                            width="640"
                            height="256"
                            className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#0EA5E9] flex items-center justify-center">
                            <span className="text-4xl">{r.categoryIcon || '📍'}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0" />
                        <div className="absolute top-2 left-2">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/90 text-content-primary font-medium">
                            {r.status === 'pending'
                              ? 'Pendente'
                              : r.status === 'in-progress'
                              ? 'Em Andamento'
                              : r.status === 'resolved'
                              ? 'Resolvida'
                              : r.status}
                          </span>
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-3.5 h-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            {r.views || 0}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="secondary"
                              size="icon"
                              onClick={(e) => handleShareReport(r, e)}
                              className="h-7 w-7 rounded-full bg-white/95 text-content-secondary"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={upvoteLoading}
                              onClick={(e) => handleFeaturedUpvote(r, e)}
                              className={`h-7 px-2 rounded-full bg-white/95 text-xs font-medium ${
                                r.user_has_upvoted ? 'text-brand' : 'text-content-secondary'
                              }`}
                            >
                              <Heart
                                className={`w-4 h-4 mr-1 ${
                                  r.user_has_upvoted ? 'fill-[#EF4444]' : ''
                                }`}
                              />
                              {r.upvotes}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 space-y-1.5">
                        <p className="text-xs text-content-secondary flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{r.address || 'Endereço não informado'}</span>
                        </p>
                        <p className="text-sm md:text-base font-semibold text-content-primary leading-snug md:leading-snug line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">
                          {r.title}
                        </p>
                        <p className="text-xs md:text-sm text-content-secondary mt-0.5 leading-snug md:leading-snug line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                          {r.description}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-content-secondary">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{r.categoryIcon}</span>
                            <span className="truncate">{r.categoryName}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-progressBg text-status-progressFg font-medium">
                            Bronca em destaque
                          </span>
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:flex" />
              <CarouselNext className="hidden md:flex" />
            </Carousel>
          </section>
        )}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
                <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                Petições
              </p>
              <h2 className="text-lg md:text-2xl font-bold text-content-primary ">Petições Ativas</h2>
              <p className="text-xs md:text-sm text-content-secondary lg:mb-4">
                Apoie causas importantes da cidade.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs md:text-sm rounded-full border-status-pendingBorder text-status-pendingFg hover:bg-surface-subtle"
              onClick={() => navigate('/abaixo-assinados')}
            >
              Ver Todas
            </Button>
          </div>

          <div className="pb-2 -mx-1 px-1">
            {loadingPetitions ? (
              <div className="flex flex-col items-center gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-full ${
                      isDesktopCarousel ? 'md:min-w-[340px] md:max-w-[340px]' : 'md:max-w-none md:min-w-0'
                    } rounded-2xl bg-surface-raised border border-edge-subtle shadow-sm md:flex-shrink-0 mx-auto md:mx-0`}
                  >
                    <div className="h-40 w-full bg-surface-base animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 w-1/3 rounded bg-surface-sunken animate-pulse" />
                      <div className="h-4 w-3/4 rounded bg-surface-sunken animate-pulse" />
                      <div className="h-3 w-full rounded bg-surface-sunken animate-pulse" />
                      <div className="h-2 w-full rounded bg-surface-sunken animate-pulse mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : petitions.length === 0 ? (
              <div className="min-w-full text-center text-xs text-content-secondary py-6">
                Ainda não há petições ativas com doações registradas.
              </div>
            ) : (
              <Carousel className="w-full" opts={{ align: 'start', loop: true }}>
                <CarouselContent className="-ml-3">
                  {petitions.map((petition) => (
                    <CarouselItem
                      key={petition.id}
                      className="pl-3 basis-[85%] sm:basis-[60%] md:basis-1/2 lg:basis-1/3"
                    >
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="w-full h-full flex flex-col rounded-2xl bg-surface-raised border border-edge-subtle shadow-sm md:flex-shrink-0 mx-auto md:mx-0 overflow-hidden"
                      >
                        <div className="relative h-36 md:h-40 w-full overflow-hidden">
                          {petition.image_url ? (
                            <img
                              src={petition.image_url}
                              alt={petition.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-surface-subtle flex items-center justify-center">
                              <Megaphone className="w-8 h-8 text-status-pendingFg" />
                            </div>
                          )}
                        </div>
                         <div className="p-3 md:p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] md:text-xs font-semibold text-status-pendingFg flex items-center gap-1">
                              <Megaphone className="w-3 h-3 md:w-4 md:h-4" />
                              Petição Ativa
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleSharePetition(petition, e)}
                              className="h-7 w-7 rounded-full text-content-secondary"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                         <h3 className="text-sm md:text-base font-semibold text-content-primary leading-snug md:leading-snug line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">
                            {petition.title}
                          </h3>
                          <p className="text-xs md:text-sm text-content-secondary leading-snug md:leading-snug line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                            {petition.description}
                          </p>
                          <div className="">
                            <div className="mt-2">
                              {(() => {
                                const signatures = typeof petition.signatureCount === 'number' ? petition.signatureCount : 0;
                                const rawGoal = Number(petition.goal);
                                const baseGoal = Number.isFinite(rawGoal) && rawGoal > 0 ? rawGoal : 100;
                                const displayGoal = getNextSignatureGoal(signatures, baseGoal);
                                const progress = Math.min((signatures / displayGoal) * 100, 100);
                                return (
                                  <>
                                    <div className="flex items-center justify-between text-[11px] md:text-xs text-content-secondary mb-1">
                                      <span>{signatures} assinaturas</span>
                                      <span>Meta {displayGoal}</span>
                                    </div>
                                    <Progress
                                      value={progress}
                                      className="h-1.5 bg-surface-base [&>div]:bg-tc-red rounded-full"
                                    />
                                  </>
                                );
                              })()}
                            </div>
                            <Button
                              className="w-full mt-3 h-9 text-xs md:text-sm font-semibold bg-tc-red hover:bg-tc-red/90 rounded-full"
                              onClick={() => handleOpenPetition(petition.id)}
                            >
                              Apoiar Agora
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="hidden md:flex" />
                <CarouselNext className="hidden md:flex" />
              </Carousel>
            )}
          </div>
        </section>
      </div>
      <Dialog open={showPetitionsUpdate} onOpenChange={handlePetitionsUpdateVisibility}>
        <DialogContent hideClose className="max-w-[calc(100vw-1.5rem)] sm:max-w-[520px] md:max-w-[720px] p-0 overflow-hidden border-none rounded-xl">
          <div className="flex flex-col md:flex-row">
            {promoModalConfig?.image_url && (
              <div className="w-full md:w-1/2 bg-surface-subtle overflow-hidden h-36 sm:h-56 md:h-auto">
                <img
                  src={promoModalConfig.image_url}
                  alt={promoModalConfig?.title || "Promoção"}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className={`w-full ${promoModalConfig?.image_url ? 'md:w-1/2' : ''} p-5 md:p-7 flex flex-col gap-4`}>
              <DialogClose asChild>
                <button
                  type="button"
                  className="sm:hidden absolute top-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-content-primary shadow-md"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
              <DialogClose asChild>
                <button
                  type="button"
                  className="hidden sm:inline-flex absolute top-4 right-4 z-10 h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-content-primary shadow-md hover:bg-surface-raised"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
              {promoModalConfig?.badge_text && (
                <div className="flex items-center gap-2 text-xs font-semibold text-status-pendingFg uppercase tracking-[0.18em]">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-pendingFg" />
                  {promoModalConfig.badge_text}
                </div>
              )}
              <div className="space-y-2">
                {promoModalConfig?.title && (
                  <h2 className="text-xl md:text-2xl font-bold text-content-primary">
                    {promoModalConfig.title}
                  </h2>
                )}
                {promoModalConfig?.description && (
                  <p className="text-sm md:text-[15px] text-content-secondary leading-relaxed">
                    {promoModalConfig.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 mt-2">
                {promoModalConfig?.primary_button_text && (
                  <Button
                    className="w-full h-10 text-sm font-semibold rounded-full bg-tc-red hover:bg-tc-red/90"
                    onClick={handleGoToMyPetitions}
                  >
                    {promoModalConfig.primary_button_text}
                  </Button>
                )}
                {promoModalConfig?.secondary_button_text && (
                  <Button
                    variant="outline"
                    className="w-full h-10 text-sm font-semibold rounded-full border-status-pendingBorder text-status-pendingFg hover:bg-surface-subtle"
                    onClick={handleGoToPetitionsOverview}
                  >
                    {promoModalConfig.secondary_button_text}
                  </Button>
                )}
                <DialogClose asChild>
                  <button
                    type="button"
                    className="mt-1 text-xs text-content-secondary hover:text-content-primary self-center"
                  >
                    {promoModalConfig?.dismiss_text || "Fechar"}
                  </button>
                </DialogClose>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </div>
  );
}

// Filtro de cidade local a esta tela — nao altera o feed nem persiste.
export default function HomePageImprovedWithCityView() {
  return (
    <CityViewProvider>
      <HomePageImproved />
    </CityViewProvider>
  );
}
