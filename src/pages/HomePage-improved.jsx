import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, ChevronRight, Heart, Megaphone, List, Map as MapIcon, Filter, Maximize2, Minimize2, X, BarChart3, AlertTriangle, Clock3, Check, Share2, Search, Plus } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import ReportModal from '@/components/ReportModal';
import { supabase } from '@/lib/customSupabaseClient';
import BottomNav from '@/components/BottomNav';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import MapView from '@/components/MapView';
import ReportList from '@/components/ReportList';
import RankingSidebar from '@/components/RankingSidebar';
import { useUpvote } from '@/hooks/useUpvotes';
import { getReportShareUrl, getPetitionShareUrl } from '@/lib/shareUtils';
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

function MiniMapPreview() {
  const center = FLORESTA_COORDS;
  const secondary = [center[0] + 0.002, center[1] + 0.003];
  const tertiary = [center[0] - 0.002, center[1] - 0.002];

  return (
    <MapContainer
      center={center}
      zoom={INITIAL_ZOOM}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      zoomControl={false}
      attributionControl={false}
      className="w-full h-full"
      style={{ background: '#111827' }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker
        center={center}
        radius={10}
        pathOptions={{ color: '#F97316', fillColor: '#F97316', fillOpacity: 0.9 }}
      />
      <CircleMarker
        center={secondary}
        radius={8}
        pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.9 }}
      />
      <CircleMarker
        center={tertiary}
        radius={8}
        pathOptions={{ color: '#22C55E', fillColor: '#22C55E', fillOpacity: 0.9 }}
      />
    </MapContainer>
  );
}

function HomePageImproved() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { handleUpvote, loading: upvoteLoading } = useUpvote();
  const [showPetitionsUpdate, setShowPetitionsUpdate] = useState(false);
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [filteredReports, setFilteredReports] = useState([]);
  const [viewMode, setViewMode] = useState('map');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const explorerRef = useRef(null);

  useEffect(() => {
    const seen = localStorage.getItem('home-petitions-update-modal-v1');
    if (!seen) {
      setShowPetitionsUpdate(true);
    }
  }, []);

  const handlePetitionsUpdateVisibility = (open) => {
    setShowPetitionsUpdate(open);
    if (!open) {
      localStorage.setItem('home-petitions-update-modal-v1', 'true');
    }
  };

  const handleGoToPetitionsOverview = () => {
    localStorage.setItem('home-petitions-update-modal-v1', 'true');
    setShowPetitionsUpdate(false);
    navigate('/abaixo-assinados');
  };

  const handleGoToMyPetitions = () => {
    localStorage.setItem('home-petitions-update-modal-v1', 'true');
    setShowPetitionsUpdate(false);
    navigate('/minhas-peticoes');
  };

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id, status, author_id, moderation_status')
        .eq('moderation_status', 'approved');

      if (error) {
        throw error;
      }

      const reports = data || [];
      const activeReports = reports.filter((r) => r.status !== 'duplicate');
      const pending = activeReports.filter((r) => r.status === 'pending').length;
      const inProgress = activeReports.filter((r) => r.status === 'in-progress').length;
      const totalResolved = activeReports.filter((r) => r.status === 'resolved').length;
      const total = pending + inProgress;
      const userResolved = user
        ? activeReports.filter((r) => r.status === 'resolved' && r.author_id === user.id).length
        : 0;

      setStats({
        total,
        pending,
        inProgress,
        totalResolved,
        resolved: userResolved,
      });
    } catch (err) {
      console.error('Erro ao buscar estatísticas da home:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [user]);

  const fetchTopPetitions = useCallback(async () => {
    setLoadingPetitions(true);
    try {
      const { data: petitionsData, error: petitionsError } = await supabase
        .from('petitions')
        .select('id, title, description, image_url, goal, created_at, signatures(count)')
        .eq('status', 'open');

      if (petitionsError) {
        throw petitionsError;
      }

      let processed = (petitionsData || []).map((p) => ({
        ...p,
        signatureCount: p.signatures?.[0]?.count || 0,
      }));

      const { data: donations } = await supabase
        .from('donations')
        .select('petition_id, amount')
        .eq('status', 'paid');

      const totals = {};
      (donations || []).forEach((d) => {
        const pid = d.petition_id;
        const amount = Number(d.amount) || 0;
        totals[pid] = (totals[pid] || 0) + amount;
      });

      processed = processed.map((p) => {
        const donationTotal = totals[p.id] || 0;
        const goal = p.goal || 100;
        const progress = Math.min(((p.signatureCount || 0) / goal) * 100, 100);
        return {
          ...p,
          donationTotal,
          progress,
        };
      });

      const withDonations = processed.filter((p) => (p.donationTotal || 0) > 0);

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
        ranked = [...processed].sort((a, b) => {
          const signatureDiff = (b.signatureCount || 0) - (a.signatureCount || 0);
          if (signatureDiff !== 0) return signatureDiff;
          return 0;
        });
      }

      setPetitions(ranked.slice(0, 10));
    } catch (err) {
      console.error('Erro ao buscar petições para a home:', err);
    } finally {
      setLoadingPetitions(false);
    }
  }, []);

  const fetchReportsPreview = useCallback(async () => {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
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
          user_upvotes:signatures(user_id),
          report_media(*),
          comments_count:comments(count),
          favorite_reports(user_id)
        `)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
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
        user_has_upvoted: user ? (r.user_upvotes || []).some((u) => u.user_id === user.id) : false,
        comments_count: r.comments_count?.[0]?.count || 0,
        is_favorited: user ? (r.favorite_reports || []).some((fav) => fav.user_id === user.id) : false,
      }));

      setReportsPreview(formatted);
    } catch (err) {
      console.error('Erro ao buscar broncas para o mapa da home:', err);
    } finally {
      setLoadingReports(false);
    }
  }, [user]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*');

      if (error) {
        throw error;
      }

      setCategories(data || []);
    } catch (err) {
      console.error('Erro ao buscar categorias:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchTopPetitions();
    fetchReportsPreview();
    fetchCategories();
  }, [fetchStats, fetchTopPetitions, fetchReportsPreview, fetchCategories]);

  const statusFilteredReports = useMemo(() => {
    let tempReports = reportsPreview.filter((r) => r.status !== 'duplicate');

    if (filter.status === 'active') {
      tempReports = tempReports.filter(
        (r) => r.status === 'pending' || r.status === 'in-progress'
      );
    } else if (filter.status === 'my-resolved') {
      tempReports = tempReports.filter(
        (r) => r.status === 'resolved' && user && r.author_id === user.id
      );
    } else if (filter.status === 'resolved') {
      tempReports = tempReports.filter((r) => r.status === 'resolved');
    } else if (filter.status !== 'all') {
      tempReports = tempReports.filter((r) => r.status === filter.status);
    }

    return tempReports;
  }, [reportsPreview, filter.status, user]);

  const statusCounts = useMemo(() => {
    const items = (reportsPreview || []).filter((r) => r.status !== 'duplicate');
    const pending = items.filter((r) => r.status === 'pending').length;
    const inProgress = items.filter((r) => r.status === 'in-progress').length;
    const resolved = items.filter((r) => r.status === 'resolved').length;
    const total = items.length;
    const active = pending + inProgress;
    const myResolved = user ? items.filter((r) => r.status === 'resolved' && r.author_id === user.id).length : 0;
    return { total, pending, inProgress, resolved, active, myResolved };
  }, [reportsPreview, user]);

  const categoryCounts = useMemo(() => {
    const map = {};
    statusFilteredReports.forEach((r) => {
      const k = r.category_id;
      if (!k) return;
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [statusFilteredReports]);

  useEffect(() => {
    let tempReports = statusFilteredReports;

    if (filter.category !== 'all') {
      tempReports = tempReports.filter((r) => r.category_id === filter.category);
    }

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      tempReports = tempReports.filter((r) => {
        const title = r.title ? r.title.toLowerCase() : '';
        const protocol = r.protocol ? String(r.protocol).toLowerCase() : '';
        return title.includes(term) || protocol.includes(term);
      });
    }

    setFilteredReports(tempReports);
  }, [statusFilteredReports, filter.category, searchTerm]);

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
    }));
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

  const handleShareReport = (report, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const url = getReportShareUrl(report.id);
    if (navigator.share) {
      navigator
        .share({
          title: report.title,
          text: report.description,
          url,
        })
        .catch(() => {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  const handleSharePetition = (petition, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const url = getPetitionShareUrl(petition.id);
    if (navigator.share) {
      navigator
        .share({
          url,
        })
        .catch(() => {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
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
    if (user) {
      setShowReportModal(true);
    } else {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para criar uma nova bronca.",
        variant: "destructive",
      });
      navigate('/login');
    }
  };

  const handleCreateReport = async (newReportData, uploadMediaCallback) => {
    if (!user) return;

    const { title, description, category, address, location, pole_number, is_from_water_utility } = newReportData;

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
      : { title: "Bronca enviada para moderação! 📬", description: "Sua solicitação será analisada antes de ser publicada." };

    toast(toastMessage);
    setShowReportModal(false);

    setTimeout(() => {
      fetchReportsPreview();
    }, 1000);
  };

  return (
    <div className=" flex flex-col bg-[#F9FAFB] md:px-6">
      <div className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-4 space-y-10 max-w-[88rem] mx-auto w-full">
        <section className="space-y-4">
          <div className="lg:pt-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#111827] mb-2">Broncas da Sua Cidade</h1>
              <p className="text-xs lg:text-sm text-[#6B7280]">
                Veja os problemas reportados pela comunidade e acompanhe as soluções em tempo real.
              </p>
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
                  ? 'bg-white border border-[#2563EB]/60 shadow-md'
                  : 'bg-white border border-transparent hover:border-[#2563EB]/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#1D4ED8]">Ativas</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#1D4ED8] leading-tight">
                  {loadingStats ? '–' : stats.total}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#2563EB] text-white">
                <BarChart3 className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleStatusCardClick('pending')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'pending'
                  ? 'bg-white border border-[#DC2626]/60 shadow-md'
                  : 'bg-white border border-transparent hover:border-[#DC2626]/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#B91C1C]">Pendentes</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#B91C1C] leading-tight">
                  {loadingStats ? '–' : stats.pending}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#DC2626] text-white">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleStatusCardClick('in-progress')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'in-progress'
                  ? 'bg-white border border-[#D97706]/60 shadow-md'
                  : 'bg-white border border-transparent hover:border-[#D97706]/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#B45309]">Em Andamento</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#B45309] leading-tight">
                  {loadingStats ? '–' : stats.inProgress}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#D97706] text-white">
                <Clock3 className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleStatusCardClick('resolved')}
              className={`group flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer shadow-sm ${
                filter.status === 'resolved'
                  ? 'bg-white border border-[#16A34A]/60 shadow-md'
                  : 'bg-white border border-transparent hover:border-[#16A34A]/40 hover:shadow-md'
              }`}
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#166534]">Resolvidas</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#166534] leading-tight">
                  {loadingStats ? '–' : stats.totalResolved}
                </div>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-[#16A34A] text-white">
                <Check className="w-4 h-4" />
              </div>
            </button>
          </div>

          
        </section>

        <section ref={explorerRef} className="space-y-4">
          <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                    <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                    Explorar
                  </p>
                  <h2 className="text-sm md:text-base lg:text-md font-semibold text-[#111827]">Broncas em Floresta</h2>
                  
                </div>
                <div className="inline-flex items-center rounded-full bg-white border border-[#E5E7EB] p-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs md:text-sm ${
                      viewMode === 'map'
                        ? 'bg-[#111827] text-white'
                        : 'text-[#6B7280]'
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
                        ? 'bg-[#111827] text-white'
                        : 'text-[#6B7280]'
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
                        ? 'bg-[#111827] text-white'
                        : 'text-[#6B7280]'
                    }`}
                  >
                    Ranking
                  </button>
                </div>
                  
              </div>
          
          <div className="grid lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8 space-y-4">
              

             {viewMode !== 'ranking' && ( 
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                  
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full border-[#E5E7EB] text-[#4B5563] bg-white"
                    >
                      <Filter className="w-4 h-4" />
                    </Button>
                    {!searchOpen && (
                      <span className="text-[11px] text-[#6B7280]">
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-[#E5E7EB] shadow-sm text-[#4B5563]"
                        aria-label="Abrir busca"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
                          <Input
                            type="text"
                            placeholder="Título ou protocolo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-7 h-8 text-xs md:text-sm bg-white border-[#E5E7EB] w-40 sm:w-60"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchTerm('');
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-[#E5E7EB] shadow-sm text-[#4B5563]"
                          aria-label="Fechar busca"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="relative h-8 px-3 rounded-full text-[11px] border-[#E5E7EB] text-[#374151] bg-white"
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
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                              <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                              Buscar
                            </p>
                            <div className="relative mt-2">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                              <Input
                                type="text"
                                placeholder="Título ou protocolo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-9 text-sm bg-white border-[#E5E7EB]"
                              />
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                              <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                              Status
                            </p>
                            <div className="mt-2 space-y-2">
                              <button
                                type="button"
                                onClick={() => setFilter((f) => ({ ...f, status: 'pending' }))}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                  filter.status === 'pending'
                                    ? 'border-tc-red bg-[#FEF2F2] text-[#111827]'
                                    : 'border-[#E5E7EB] bg-white text-[#374151]'
                                }`}
                              >
                                Pendentes ({statusCounts.pending})
                              </button>
                              <button
                                type="button"
                                onClick={() => setFilter((f) => ({ ...f, status: 'in-progress' }))}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                  filter.status === 'in-progress'
                                    ? 'border-tc-red bg-[#FEF2F2] text-[#111827]'
                                    : 'border-[#E5E7EB] bg-white text-[#374151]'
                                }`}
                              >
                                Em Andamento ({statusCounts.inProgress})
                              </button>
                              <button
                                type="button"
                                onClick={() => setFilter((f) => ({ ...f, status: 'resolved' }))}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                                  filter.status === 'resolved'
                                    ? 'border-tc-red bg-[#FEF2F2] text-[#111827]'
                                    : 'border-[#E5E7EB] bg-white text-[#374151]'
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
                                      ? 'border-tc-red bg-[#FEF2F2] text-[#111827]'
                                      : 'border-[#E5E7EB] bg-white text-[#374151]'
                                  }`}
                                >
                                  Minhas Resolvidas ({statusCounts.myResolved})
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
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
                                      ? 'border-tc-red bg-[#FEF2F2] text-[#111827]'
                                      : 'border-[#E5E7EB] bg-white text-[#374151]'
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
                        <div className="px-4 py-3 border-t bg-white">
                          <Button
                            className="w-full h-10 text-sm font-semibold bg-tc-red hover:bg-tc-red/90 rounded-full"
                            onClick={() => setMobileFiltersOpen(false)}
                          >
                            Aplicar Filtros
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <button
                      type="button"
                      onClick={() => setMapExpanded((prev) => !prev)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-[#E5E7EB] shadow-sm text-[#4B5563]"
                    >
                      {mapExpanded ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </button>
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
                          className={`relative rounded-2xl overflow-hidden border border-[#E5E7EB] bg-white transition-[height] duration-200 mt-2 ${
                            mapExpanded ? 'h-[26rem]' : 'h-[18rem]'
                          }`}
                        >
                          <MapView
                            reports={filteredReports}
                            onReportClick={handleReportClick}
                            onUpvote={() => {}}
                            showLegend
                            showModeToggle={false}
                            interactive
                          />
                        </div>
                    
                    </motion.div>

                    <div className="hidden md:block">
                      <div
                        className={`relative rounded-2xl overflow-hidden border border-[#E5E7EB] transition-[height] duration-200 mt-2 ${
                          mapExpanded ? 'h-[30rem] xl:h-[32rem]' : 'h-[28rem] xl:h-[28rem]'
                        }`}
                      >
                        <MapView
                          reports={filteredReports}
                          onReportClick={handleReportClick}
                          onUpvote={() => {}}
                          showLegend
                          showModeToggle={false}
                          interactive
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="max-h-[26rem] md:max-h-[30rem] xl:max-h-[32rem] overflow-y-auto -mx-1 px-1 mt-2">
                    <ReportList reports={filteredReports} onReportClick={handleReportClick} />
                  </div>
                )}
              </div> )}
            </div>

            <aside className="hidden lg:block lg:col-span-4">
              <RankingSidebar reports={reportsPreview} onReportClick={handleReportClick} />
            </aside>
          </div>
        </section>
       { viewMode === 'ranking' && (
                        <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden mt-2">
                          <RankingSidebar
                            embedded
                            reports={reportsPreview}
                            onReportClick={handleReportClick}
                          />
                        </div>)}

        {featuredReports.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                  <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                  Destaques
                </p>
                <h2 className="text-lg md:text-2xl font-bold text-[#111827]">Broncas em Destaque</h2>
                <p className="text-xs md:text-sm text-[#6B7280]">Acompanhe as principais broncas.</p>
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
                      className="h-full bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition"
                      onClick={() => handleReportClick(r)}
                      role="button"
                    >
                      <div className="relative h-36 md:h-40 w-full">
                        {r.coverImage ? (
                          <img
                            src={r.coverImage}
                            alt={r.title}
                            className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#0EA5E9] flex items-center justify-center">
                            <span className="text-4xl">{r.categoryIcon || '📍'}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0" />
                        <div className="absolute top-2 left-2">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/90 text-[#111827] font-medium">
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
                              className="h-7 w-7 rounded-full bg-white/95 text-[#374151]"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={upvoteLoading}
                              onClick={(e) => handleFeaturedUpvote(r, e)}
                              className={`h-7 px-2 rounded-full bg-white/95 text-xs font-medium ${
                                r.user_has_upvoted ? 'text-[#EF4444]' : 'text-[#374151]'
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
                        <p className="text-xs text-[#6B7280] flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{r.address || 'Endereço não informado'}</span>
                        </p>
                        <p className="text-sm md:text-base font-semibold text-[#111827] leading-snug md:leading-snug line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">
                          {r.title}
                        </p>
                        <p className="text-xs md:text-sm text-[#6B7280] mt-0.5 leading-snug md:leading-snug line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                          {r.description}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#6B7280]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{r.categoryIcon}</span>
                            <span className="truncate">{r.categoryName}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] font-medium">
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
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
                <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                Petições
              </p>
              <h2 className="text-lg md:text-2xl font-bold text-[#111827] ">Petições Ativas</h2>
              <p className="text-xs md:text-sm text-[#6B7280] lg:mb-4">
                Apoie causas importantes da cidade.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs md:text-sm rounded-full border-[#F97316] text-[#F97316] hover:bg-[#FEF2F2]"
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
                    } rounded-2xl bg-white border border-[#F3F4F6] shadow-sm md:flex-shrink-0 mx-auto md:mx-0`}
                  >
                    <div className="h-40 w-full bg-[#F3F4F6] animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 w-1/3 rounded bg-[#E5E7EB] animate-pulse" />
                      <div className="h-4 w-3/4 rounded bg-[#E5E7EB] animate-pulse" />
                      <div className="h-3 w-full rounded bg-[#E5E7EB] animate-pulse" />
                      <div className="h-2 w-full rounded bg-[#E5E7EB] animate-pulse mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : petitions.length === 0 ? (
              <div className="min-w-full text-center text-xs text-[#6B7280] py-6">
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
                        className="w-full h-full flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm md:flex-shrink-0 mx-auto md:mx-0 overflow-hidden"
                      >
                        <div className="relative h-36 md:h-40 w-full overflow-hidden">
                          {petition.image_url ? (
                            <img
                              src={petition.image_url}
                              alt={petition.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-[#FEF2F2] flex items-center justify-center">
                              <Megaphone className="w-8 h-8 text-[#F97316]" />
                            </div>
                          )}
                        </div>
                         <div className="p-3 md:p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] md:text-xs font-semibold text-[#F97316] flex items-center gap-1">
                              <Megaphone className="w-3 h-3 md:w-4 md:h-4" />
                              Petição Ativa
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleSharePetition(petition, e)}
                              className="h-7 w-7 rounded-full text-[#6B7280]"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                         <h3 className="text-sm md:text-base font-semibold text-[#111827] leading-snug md:leading-snug line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">
                            {petition.title}
                          </h3>
                          <p className="text-xs md:text-sm text-[#6B7280] leading-snug md:leading-snug line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                            {petition.description}
                          </p>
                          <div className="">
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-[11px] md:text-xs text-[#6B7280] mb-1">
                                <span>{petition.signatureCount} assinaturas</span>
                                <span>Meta {petition.goal || 100}</span>
                              </div>
                              <Progress
                                value={petition.progress}
                                className="h-1.5 bg-[#F3F4F6] [&>div]:bg-tc-red rounded-full"
                              />
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
            <div className="w-full md:w-1/2 bg-[#FEF2F2] overflow-hidden h-36 sm:h-56 md:h-auto">
              <img
                src="/abaixo-assinado.jpg"
                alt="Criar e apoiar abaixo-assinados"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="w-full md:w-1/2 p-5 md:p-7 flex flex-col gap-4">
              <DialogClose asChild>
                <button
                  type="button"
                  className="sm:hidden absolute top-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#111827] shadow-md"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
              <DialogClose asChild>
                <button
                  type="button"
                  className="hidden sm:inline-flex absolute top-4 right-4 z-10 h-8 w-8 items-center justify-center rounded-full bg-white text-[#111827] shadow-md hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F97316] uppercase tracking-[0.18em]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                Novidade na plataforma
              </div>
              <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-bold text-[#111827]">
                  Agora você também pode criar e apoiar abaixo-assinados
                </h2>
                <p className="text-sm md:text-[15px] text-[#4B5563] leading-relaxed">
                  Suas broncas podem virar campanhas completas, fortaleça causas que já estão em andamento.
                  Assine, compartilhe e ajude a pressionar por soluções reais para a cidade.
                </p>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <Button
                  className="w-full h-10 text-sm font-semibold rounded-full bg-tc-red hover:bg-tc-red/90"
                  onClick={handleGoToMyPetitions}
                >
                  Criar meu abaixo-assinado
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm font-semibold rounded-full border-[#F97316] text-[#F97316] hover:bg-[#FEF2F2]"
                  onClick={handleGoToPetitionsOverview}
                >
                  Ver causas para apoiar
                </Button>
                <DialogClose asChild>
                  <button
                    type="button"
                    className="mt-1 text-xs text-[#6B7280] hover:text-[#111827] self-center"
                  >
                    Talvez depois
                  </button>
                </DialogClose>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <BottomNav />
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </div>
  );
}

export default HomePageImproved;
