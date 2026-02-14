import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { List, Map as MapIcon, Filter, Plus, Megaphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import MapView from '@/components/MapView';
import ReportModal from '@/components/ReportModal';
import ReportDetails from '@/components/ReportDetails';
import StatsCards from '@/components/StatsCards';
import ReportList from '@/components/ReportList';
import LinkReportModal from '@/components/LinkReportModal';
import RankingSidebar from '@/components/RankingSidebar';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpvote } from '../hooks/useUpvotes';

function HomePage() {
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const [viewMode, setViewMode] = useState('map');
  const [filter, setFilter] = useState({ category: 'all', status: 'active' });
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, resolved: 0 });
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const viewContainerRef = useRef(null);
  const { handleUpvote, loading } = useUpvote();
  const [topDonated, setTopDonated] = useState([]);
  const [donationLoading, setDonationLoading] = useState(true);
  const [promoVisible, setPromoVisible] = useState(false);
  const promoRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const [donationCarouselApi, setDonationCarouselApi] = useState(null);

  const handleOpenPetition = useCallback((id) => {
    try {
      document.documentElement?.style?.setProperty('--app-banner-height', '0px');
    } catch {}
    setPromoVisible(false);
    navigate(`/abaixo-assinado/${id}`);
  }, [navigate]);

  useEffect(() => {
    if (!donationCarouselApi) return;
    const id = setInterval(() => {
      donationCarouselApi.scrollNext();
    }, 3000);
    return () => clearInterval(id);
  }, [donationCarouselApi]);

  // ✅ Recuperação de Estado: Abrir modal se houver foto pendente (pós-crash)
  useEffect(() => {
    const handleOpenModal = () => {

      setShowReportModal(true);
    };

    window.addEventListener('open-report-modal-with-photo', handleOpenModal);
    
    // Verificar se JÁ existe uma foto pendente (caso o evento tenha disparado antes da montagem)
    if (window.__PENDING_RESTORED_PHOTO__) {
      setTimeout(handleOpenModal, 500);
    }

    return () => {
      window.removeEventListener('open-report-modal-with-photo', handleOpenModal);
    };
  }, []);

  // Função para buscar reports
  const fetchReports = useCallback(async () => {
    try {
      let reportsQuery = supabase
        .from('reports')
        .select(`
          id, 
          title, 
          description, 
          status, 
          created_at, 
          location, 
          address, 
          protocol, 
          category_id, 
          author_id, 
          moderation_status, 
          is_recurrent,
          resolved_at,
          linked_to,
          resolution_submission,
          pole_number,
          category:categories(name, icon),
          author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config),
          upvotes:signatures(count),
          user_upvotes:signatures(user_id),
          comments:comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)),
          comments_count:comments(count),
          report_media(*),
          favorite_reports(user_id),
          petitions(id, status)
        `)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false });

      const { data: reportsData, error: reportsError } = await reportsQuery;
      
      if (reportsError) {
        throw reportsError;
      }

      const formattedData = reportsData.map(r => ({
        ...r,
        location: r.location ? { 
          lat: r.location.coordinates[1], 
          lng: r.location.coordinates[0] 
        } : null,
        category: r.category_id,
        categoryName: r.category?.name,
        categoryIcon: r.category?.icon,
        authorName: r.author?.name || 'Anônimo',
        upvotes: r.upvotes[0]?.count || 0,
        user_has_upvoted: user ? r.user_upvotes.some(upvote => upvote.user_id === user.id) : false,
        comments_count: r.comments_count[0]?.count || 0,
        comments: (r.comments || []).filter(c => c.moderation_status === 'approved'),
        photos: (r.report_media || []).filter(m => m.type === 'photo'),
        videos: (r.report_media || []).filter(m => m.type === 'video'),
        is_favorited: user ? r.favorite_reports.some(fav => fav.user_id === user.id) : false,
        // Preservar resolution_submission se existir
        resolution_submission: r.resolution_submission || null,
        petitionId: r.petitions?.[0]?.id || null,
        petitionStatus: r.petitions?.[0]?.status || null,
      }));
      
      setReports(formattedData);
      return formattedData;
    } catch (error) {
      console.error('Erro ao buscar reports:', error);
      toast({ 
        title: "Erro ao buscar broncas", 
        description: `Erro: ${error.message}`,
        variant: "destructive" 
      });
      return [];
    }
  }, [toast, user]);

  const fetchTopDonatedPetitions = useCallback(async () => {
    setDonationLoading(true);
    try {
      const { data: petitionsData, error: petitionsError } = await supabase
        .from('petitions')
        .select('id, title, description, image_url, goal, created_at, signatures(count)')
        .eq('status', 'open');
      if (petitionsError) throw petitionsError;
      let processed = (petitionsData || []).map(p => ({
        ...p,
        signatureCount: p.signatures?.[0]?.count || 0,
        progress: Math.min(((p.signatures?.[0]?.count || 0) / (p.goal || 100)) * 100, 100)
      }));
      const { data: donations } = await supabase
        .from('donations')
        .select('petition_id, amount')
        .eq('status', 'paid');
      const totals = {};
      (donations || []).forEach(d => {
        const pid = d.petition_id;
        const amount = Number(d.amount) || 0;
        totals[pid] = (totals[pid] || 0) + amount;
      });
      processed = processed.map(p => ({
        ...p,
        donationTotal: totals[p.id] || 0
      }));
      const donatedSorted = [...processed]
        .filter(p => (p.donationTotal || 0) > 0)
        .sort((a, b) => {
          if ((b.donationTotal || 0) !== (a.donationTotal || 0)) {
            return (b.donationTotal || 0) - (a.donationTotal || 0);
          }
          return (b.signatureCount || 0) - (a.signatureCount || 0);
        })
        .slice(0, 10);
      setTopDonated(donatedSorted);
    } catch (err) {
    } finally {
      setDonationLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopDonatedPetitions();
  }, [fetchTopDonatedPetitions]);

  // Função para buscar categorias
  const fetchCategories = useCallback(async () => {
    try {
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*');
        
      if (categoriesError) {
        throw categoriesError;
      }
      
      setCategories(categoriesData || []);
    } catch (error) {
      toast({ 
        title: "Erro ao buscar categorias", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  }, [toast]);

  // Função para buscar todos os dados iniciais
  const fetchInitialData = useCallback(async () => {
    await Promise.all([fetchReports(), fetchCategories()]);
  }, [fetchReports, fetchCategories]);

  useEffect(() => {
    fetchInitialData();
    const dismissed = localStorage.getItem('home-promo-topbar-dismissed');
    if (!dismissed) {
      setPromoVisible(true);
    }
    
    let channel = null;
    let pollingInterval = null;
    let appStateListener = null;
    
    // Configurar realtime subscription
    try {
      channel = supabase.channel('realtime reports')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'reports',
            filter: 'moderation_status=eq.approved'
          }, 
          (payload) => {
            fetchReports();
          }
        )
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'signatures'
          },
          (payload) => {
            fetchReports();
          }
        )
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'comments'
          },
          (payload) => {
            fetchReports();
          }
        )
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'report_media'
          },
          (payload) => {
            fetchReports();
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          }
        });
    } catch (error) {
      console.error('[HomePage] Erro ao configurar subscription realtime:', error);
    }

    // Fallback: Polling periódico para garantir atualização (especialmente no app nativo)
    const startPolling = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      // Atualizar a cada 30 segundos
      pollingInterval = setInterval(() => {
        fetchReports();
      }, 30000);
    };

    // Iniciar polling
    startPolling();

    // Listener para quando o app volta ao foreground (Capacitor)
    const setupAppStateListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const { Capacitor } = await import('@capacitor/core');
        
        if (Capacitor.isNativePlatform()) {
          appStateListener = await App.addListener('appStateChange', async ({ isActive }) => {
            if (isActive) {
              // Aguardar um pouco antes de atualizar para não interferir com processamento de foto/vídeo
              // Isso evita conflitos quando o app volta do background durante captura
              setTimeout(() => {
                fetchReports();
              }, 2000); // Aumentado para 2 segundos para dar tempo do processamento
            }
          });
        }
      } catch (error) {
        // Capacitor não disponível ou não é app nativo, ignorar
      }
    };
    setupAppStateListener();

    // Listener para quando a página fica visível (Web e Capacitor)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Aguardar um pouco antes de atualizar para não interferir com processamento de foto/vídeo
        setTimeout(() => {
          fetchReports();
        }, 2000); // Aumentado para 2 segundos para dar tempo do processamento
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      if (appStateListener) {
        appStateListener.remove();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchInitialData, fetchReports]);

  useEffect(() => {
    const updateBannerHeight = () => {
      if (promoVisible && promoRef.current) {
        const height = `${promoRef.current.offsetHeight || 56}px`;
        document.documentElement.style.setProperty('--app-banner-height', height);
      } else {
        document.documentElement.style.setProperty('--app-banner-height', '0px');
      }
    };
    updateBannerHeight();
    window.addEventListener('resize', updateBannerHeight);
    return () => {
      window.removeEventListener('resize', updateBannerHeight);
      document.documentElement.style.setProperty('--app-banner-height', '0px');
    };
  }, [promoVisible]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleDismissPromo = () => {
    setPromoVisible(false);
    localStorage.setItem('home-promo-topbar-dismissed', 'true');
    document.documentElement.style.setProperty('--app-banner-height', '0px');
  };

  const statusFilteredReports = useMemo(() => {
    let tempReports = reports.filter(r => r.status !== 'duplicate');

    if (filter.status === 'active') {
      tempReports = tempReports.filter(r => r.status === 'pending' || r.status === 'in-progress');
    } else if (filter.status === 'my-resolved') {
      tempReports = tempReports.filter(r => r.status === 'resolved' && user && r.author_id === user.id);
    } else if (filter.status === 'resolved') {
      tempReports = tempReports.filter(r => r.status === 'resolved');
    } else if (filter.status !== 'all') {
      tempReports = tempReports.filter(r => r.status === filter.status);
    }
    return tempReports;
  }, [reports, filter.status, user]);

  const categoryCounts = useMemo(() => {
    const counts = statusFilteredReports.reduce((acc, report) => {
      const categoryId = report.category_id;
      if (categoryId) {
        acc[categoryId] = (acc[categoryId] || 0) + 1;
      }
      return acc;
    }, {});
    return counts;
  }, [statusFilteredReports]);

  useEffect(() => {
    let tempReports = statusFilteredReports;
    
    if (filter.category !== 'all') {
      tempReports = tempReports.filter(r => r.category_id === filter.category);
    }
    setFilteredReports(tempReports);
  }, [statusFilteredReports, filter.category]);

  useEffect(() => {
    const activeReports = reports.filter(r => r.status !== 'duplicate');
    const pending = activeReports.filter(r => r.status === 'pending').length;
    const inProgress = activeReports.filter(r => r.status === 'in-progress').length;
    const totalResolved = activeReports.filter(r => r.status === 'resolved').length;
    const userResolved = user 
      ? activeReports.filter(r => r.status === 'resolved' && r.author_id === user.id).length
      : 0;
    const total = pending + inProgress;
    setStats({ total, pending, inProgress, resolved: userResolved, totalResolved });
  }, [reports, user]);

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

    const { title, description, category, address, location, pole_number } = newReportData;
 
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
        status: 'pending',
        moderation_status: user?.is_admin ? 'approved' : 'pending_approval'
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
    
    // Atualizar a lista de reports após criar um novo
    setTimeout(() => {
      fetchReports();
    }, 1000);
  };

  const handleUpdateReport = async (editData) => {
    const { id, title, description, address, location, category_id, newPhotos, newVideos, removedMedia, status, is_recurrent, evaluation, resolution_submission } = editData;

    const reportUpdates = { 
      title, 
      description, 
      address, 
      category_id, 
      status, 
      is_recurrent, 
      evaluation, 
      resolution_submission 
    };
    
    if (location) {
      reportUpdates.location = `POINT(${location.lng} ${location.lat})`;
    }

    try {
      // Atualizar o report
      const { error: updateError } = await supabase
        .from('reports')
        .update(reportUpdates)
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      // Remover mídia se necessário
      if (removedMedia && removedMedia.length > 0) {
        const { error: deleteError } = await supabase
          .from('report_media')
          .delete()
          .in('id', removedMedia);
        
        if (deleteError) {
          console.error('Erro ao remover mídia:', deleteError);
        }
      }

      // Upload de nova mídia
      const mediaToUpload = [
        ...(newPhotos || []).map(p => ({ ...p, type: 'photo' })),
        ...(newVideos || []).map(v => ({ ...v, type: 'video' }))
      ];

      if (mediaToUpload.length > 0) {
        const uploadPromises = mediaToUpload.map(async (media) => {
          const filePath = `${user.id}/${id}/${Date.now()}-${media.name}`;
          const { error: uploadError } = await supabase.storage
            .from('reports-media')
            .upload(filePath, media.file);
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('reports-media')
            .getPublicUrl(filePath);
          
          return { 
            report_id: id, 
            url: publicUrl, 
            type: media.type, 
            name: media.name 
          };
        });

        const uploadedMedia = await Promise.all(uploadPromises);
        
        if (uploadedMedia.length > 0) {
          const { error: insertError } = await supabase
            .from('report_media')
            .insert(uploadedMedia);
          
          if (insertError) throw insertError;
        }
      }

      // Buscar dados atualizados
      await fetchReports();
      
      toast({ 
        title: "Bronca atualizada com sucesso! ✨",
        description: "As informações foram atualizadas e o mapa foi renovado."
      });
      setSelectedReport(null);
      
    } catch (error) {
      console.error('Erro ao atualizar report:', error);
      toast({ 
        title: "Erro ao atualizar bronca", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleOpenLinkModal = (sourceReport) => {
    if (!user) {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para vincular broncas.",
        variant: "destructive",
      });
      navigate('/login');
      return;
    }
    setReportToLink(sourceReport);
    setShowLinkModal(true);
  };

  const handleLinkReport = async (sourceReportId, targetReportId) => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status: 'duplicate', linked_to: targetReportId })
        .eq('id', sourceReportId);

      if (error) {
        throw error;
      }

      toast({ title: "Bronca vinculada! 🔗", description: "A solicitação foi marcada como duplicada." });
      setShowLinkModal(false);
      setReportToLink(null);
      setSelectedReport(null);
      
      // Atualizar a lista de reports após vincular
      setTimeout(() => {
        fetchReports();
      }, 500);
    } catch (error) {
      toast({ title: "Erro ao vincular bronca", description: error.message, variant: "destructive" });
    }
  };

 // Função para favoritar com atualização IMEDIATA
    const handleFavoriteToggleWithRefresh = async (reportId, isFavorited) => {
      if (!user) {
        toast({ 
          title: "Acesso restrito", 
          description: "Você precisa fazer login para favoritar.", 
          variant: "destructive" 
        });
        navigate('/login');
        return;
      }

      // Salvar o estado atual ANTES da mudança para possível rollback
      const originalIsFavorited = isFavorited;

      // Atualização OTIMISTA - muda o estado imediatamente
      const newIsFavorited = !isFavorited;

      // Atualiza o estado local IMEDIATAMENTE
      setReports(prevReports => 
        prevReports.map(report => 
          report.id === reportId 
            ? { 
                ...report, 
                is_favorited: newIsFavorited 
              }
            : report
        )
      );

      // Atualiza o report selecionado se estiver aberto
      if (selectedReport && selectedReport.id === reportId) {
        setSelectedReport(prev => ({
          ...prev,
          is_favorited: newIsFavorited
        }));
      }

      try {
        if (newIsFavorited) {
          // Adicionar aos favoritos
          const { error } = await supabase
            .from('favorite_reports')
            .insert({ user_id: user.id, report_id: reportId });
          
          if (error) throw error;
          
          toast({ title: "Adicionado aos favoritos! ⭐", description: "A bronca foi salva nos seus favoritos." });
        } else {
          // Remover dos favoritos
          const { error } = await supabase
            .from('favorite_reports')
            .delete()
            .match({ user_id: user.id, report_id: reportId });
          
          if (error) throw error;
          
          toast({ title: "Removido dos favoritos! 💔", description: "A bronca foi removida dos seus favoritos." });
        }

      } catch (error) {
        console.error('Erro no processo de favoritar:', error);
        
        // Reverte em caso de erro
        setReports(prevReports => 
          prevReports.map(report => 
            report.id === reportId 
              ? { 
                  ...report, 
                  is_favorited: originalIsFavorited 
                }
              : report
          )
        );

        if (selectedReport && selectedReport.id === reportId) {
          setSelectedReport(prev => ({
            ...prev,
            is_favorited: originalIsFavorited
          }));
        }
        
        toast({ 
          title: "Erro", 
          description: "Não foi possível atualizar os favoritos.", 
          variant: "destructive" 
        });
      }

      // Atualização final para sincronizar com o banco
      setTimeout(() => {
        fetchReports();
      }, 1000);
    };

  const handleSelectReport = (report) => {
    setSelectedReport(report);
  };

  const handleStatsCardClick = (status) => {
    setFilter(f => ({ ...f, status, category: 'all' }));
    viewContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Função para upvote com atualização IMEDIATA
  // Função para upvote com atualização IMEDIATA - VERSÃO CORRIGIDA
// Função para upvote com atualização IMEDIATA - VERSÃO CORRIGIDA
const handleUpvoteWithRefresh = async (reportId, currentUpvotes, userHasUpvoted) => {
  if (!user) {
    toast({ 
      title: "Acesso restrito", 
      description: "Você precisa fazer login para apoiar.", 
      variant: "destructive" 
    });
    navigate('/login');
    return;
  }

  // Salvar o estado atual ANTES da mudança para possível rollback
  const originalUpvotes = currentUpvotes;
  const originalUserHasUpvoted = userHasUpvoted;

  // Atualização OTIMISTA - muda o estado imediatamente
  const newUserHasUpvoted = !userHasUpvoted;
  const newUpvotes = newUserHasUpvoted ? currentUpvotes + 1 : Math.max(0, currentUpvotes - 1);

  // Atualiza o estado local IMEDIATAMENTE
  setReports(prevReports => 
    prevReports.map(report => 
      report.id === reportId 
        ? { 
            ...report, 
            upvotes: newUpvotes, 
            user_has_upvoted: newUserHasUpvoted 
          }
        : report
    )
  );

  // Atualiza o report selecionado se estiver aberto
  if (selectedReport && selectedReport.id === reportId) {
    setSelectedReport(prev => ({
      ...prev,
      upvotes: newUpvotes,
      user_has_upvoted: newUserHasUpvoted
    }));
  }

  try {
    // Chama a função original do hook
    const result = await handleUpvote(reportId, originalUpvotes, originalUserHasUpvoted);
    
    // Se houve erro, reverte a atualização otimista
    if (!result.success) {
      
      setReports(prevReports => 
        prevReports.map(report => 
          report.id === reportId 
            ? { 
                ...report, 
                upvotes: originalUpvotes, 
                user_has_upvoted: originalUserHasUpvoted 
              }
            : report
        )
      );

      if (selectedReport && selectedReport.id === reportId) {
        setSelectedReport(prev => ({
          ...prev,
          upvotes: originalUpvotes,
          user_has_upvoted: originalUserHasUpvoted
        }));
      }
      
      // Mostra mensagem de erro específica
      toast({ 
        title: "Erro ao atualizar apoio", 
        description: "Não foi possível processar sua ação. Tente novamente.", 
        variant: "destructive" 
      });
    } else {
      
      // Feedback visual baseado na ação
      if (result.action === 'added') {
        toast({ title: "Apoio registrado! 👍", description: "Sua bronca ganhou um apoio!" });
      } else {
        toast({ title: "Apoio removido! 👎", description: "Seu apoio foi retirado." });
      }
    }

  } catch (error) {
    console.error('Erro no processo de upvote:', error);
    
    // Reverte em caso de erro não tratado
    setReports(prevReports => 
      prevReports.map(report => 
        report.id === reportId 
          ? { 
              ...report, 
              upvotes: originalUpvotes, 
              user_has_upvoted: originalUserHasUpvoted 
            }
          : report
      )
    );

    if (selectedReport && selectedReport.id === reportId) {
      setSelectedReport(prev => ({
        ...prev,
        upvotes: originalUpvotes,
        user_has_upvoted: originalUserHasUpvoted
      }));
    }
    
    toast({ 
      title: "Erro", 
      description: "Não foi possível processar sua ação.", 
      variant: "destructive" 
    });
  }

  // Atualização final para sincronizar com o banco (após sucesso ou erro)
  setTimeout(() => {
    fetchReports();
  }, 1500);
};

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filter.status !== 'active') count++;
    if (filter.category !== 'all') count++;
    return count;
  }, [filter]);

  const handleClearFilters = () => {
    setFilter({ status: 'active', category: 'all' });
  };

  return (
    <div className="container mx-auto px-4 py-6 overflow-visible">
      {promoVisible && (
        <div
          ref={promoRef}
          className="fixed left-0 right-0 z-[1000] text-white"
          style={{
            backgroundColor: '#F05045',
            paddingTop: 'calc(var(--safe-area-top))',
            top: 'calc(4rem + var(--safe-area-top))'
          }}
        >
          <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 relative">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="text-sm sm:text-base">
                📢 <span className="font-bold">Novidade:</span> Participe ativamente da mudança! Crie sua própria petição ou assine as existentes.
              </span>
              <Button
                size="sm"
                onClick={() => navigate('/abaixo-assinados')}
                className="bg-white text-[#F05045] hover:bg-white/90 rounded-full font-bold border border-white text-sm"
              >
                Começar Agora →
              </Button>
            </div>
            <button
              onClick={handleDismissPromo}
              aria-label="Fechar banner"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <motion.div 
        initial={{ y: 50, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        transition={{ delay: 0.2 }}
      >
        <StatsCards 
          stats={stats} 
          onCardClick={handleStatsCardClick} 
          user={user} 
        />
      </motion.div>

      <motion.div 
        initial={{ y: 50, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        transition={{ delay: 0.4 }} 
        className="mt-8 overflow-visible"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 relative z-[800] overflow-visible">
          <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm p-1.5 rounded-lg border border-border shadow-md">
            <Button 
              variant={viewMode === 'map' ? 'default' : 'ghost'} 
              onClick={() => setViewMode('map')} 
              size="sm"
              className={`gap-2 transition-all ${viewMode === 'map' ? 'bg-tc-yellow text-tc-black hover:bg-tc-yellow/90 shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              <MapIcon className="w-4 h-4" /> 
              <span className="hidden sm:inline">Mapa</span>
            </Button>
            <Button 
              variant={viewMode === 'list' ? 'default' : 'ghost'} 
              onClick={() => setViewMode('list')} 
              size="sm"
              className={`gap-2 transition-all ${viewMode === 'list' ? 'bg-tc-yellow text-tc-black hover:bg-tc-yellow/90 shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              <List className="w-4 h-4" /> 
              <span className="hidden sm:inline">Lista</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="gap-2 text-muted-foreground hover:bg-muted hover:text-foreground border-border transition-all relative"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden md:inline">Filtrar</span>
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-tc-red text-[10px] font-bold text-white shadow-sm ring-1 ring-background">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                side="bottom"
                alignOffset={-5}
                sideOffset={8}
                className="w-72 max-h-[calc(100vh-8rem)] overflow-y-auto bg-card text-foreground border border-border shadow-xl rounded-lg p-2 z-[2000]"
                style={{ 
                  maxHeight: 'calc(100vh - 8rem)',
                  overflowY: 'auto'
                }}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="font-semibold text-sm">Filtros</span>
                  {activeFiltersCount > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleClearFilters}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-tc-red hover:bg-transparent"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
                <DropdownMenuSeparator className="bg-border" />
                <div className="space-y-1">
                  <DropdownMenuLabel className="text-tc-red font-bold text-base px-3 py-2.5">Status</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuRadioGroup value={filter.status} onValueChange={(value) => setFilter(f => ({...f, status: value}))}>
                    <DropdownMenuRadioItem value="active" className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <span className="text-sm">Ativas (Pendentes/Em Andamento)</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="pending" className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <span className="text-sm">Pendentes</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="in-progress" className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <span className="text-sm">Em Andamento</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="resolved" className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <span className="text-sm">Resolvidas</span>
                    </DropdownMenuRadioItem>
                    {user && (
                      <DropdownMenuRadioItem value="my-resolved" className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                        <span className="text-sm">Minhas Resolvidas</span>
                      </DropdownMenuRadioItem>
                    )}
                </DropdownMenuRadioGroup>
                </div>
                <DropdownMenuSeparator className="bg-border my-2" />
                <div className="space-y-1">
                  <DropdownMenuLabel className="text-tc-red font-bold text-base px-3 py-2.5">Categoria</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuRadioGroup value={filter.category} onValueChange={(value) => setFilter(f => ({...f, category: value}))}>
                    <DropdownMenuRadioItem value="all" className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <span className="text-sm">Todas as Categorias</span>
                    </DropdownMenuRadioItem>
                  {categories.map(cat => (
                      <DropdownMenuRadioItem 
                        key={cat.id} 
                        value={cat.id} 
                        className="px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <div className="flex justify-between items-center gap-3 w-full">
                          <span className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-base flex-shrink-0">{cat.icon}</span>
                            <span className="text-sm truncate">{cat.name}</span>
                          </span>
                          <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 flex-shrink-0 font-semibold">
                        {categoryCounts[cat.id] || 0}
                      </span>
                        </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleNewReportClick} 
              className="bg-tc-red hover:bg-tc-red/90 gap-2 text-tc-white hidden md:flex"
            >
              <Plus className="w-4 h-4" /> Nova Bronca
            </Button>
          </div>
        </div>

        <div ref={viewContainerRef} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
            {viewMode === 'map' ? (
              <div className="h-[600px] relative">
                <MapView 
                  reports={filteredReports} 
                  onReportClick={handleSelectReport} 
                  onUpvote={handleUpvoteWithRefresh} 
                />
              </div>
            ) : (
              <ReportList 
                reports={filteredReports} 
                onReportClick={handleSelectReport} 
                onUpvote={handleUpvoteWithRefresh}
              />
            )}
          </div>
          <div className="lg:col-span-1">
            <RankingSidebar 
              reports={reports} 
              onReportClick={handleSelectReport} 
              onUpvote={handleUpvoteWithRefresh}
            />
          </div>
        </div>
      </motion.div>

      <section id="donation-carousel" className="py-8 mt-8 relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px]">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Ajude nas Causas da Nossa Cidade</h2>
              <p className="text-muted-foreground">Priorizamos campanhas com mais doações e, em seguida, assinaturas.</p>
            </div>
          </div>
          {donationLoading ? (
            <div className="flex gap-4 overflow-hidden">
              {[1,2,3,4].map(i => (
                <div key={i} className="min-w-[300px] max-w-[360px] w-full rounded-xl border bg-card overflow-hidden">
                  <Skeleton className="h-40 w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : topDonated.length > 0 ? (
            (() => {
              const threshold = isMobile ? 3 : 5;
              const useCarousel = topDonated.length >= threshold;
              if (useCarousel) {
                return (
                  <Carousel opts={{ loop: true, align: 'start' }} setApi={setDonationCarouselApi} className="relative">
                    <CarouselContent>
                      {topDonated.map(p => (
                        <CarouselItem key={p.id} className="basis-[80%] sm:basis-[50%] md:basis-[33%] lg:basis-[25%] xl:basis-[25%]">
                          <div className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow h-full">
                            <div className="h-40 bg-muted relative">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-primary/5">
                                  <Megaphone className="w-10 h-10 text-primary/30" />
                                </div>
                              )}
                            </div>
                            <div className="p-4 space-y-2">
                              <h3 className="font-bold line-clamp-2">{p.title}</h3>
                              <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                              <div className="mt-2">
                                <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1">
                                  <span>{p.signatureCount} assinaturas</span>
                                  <span>Meta {p.goal || 100}</span>
                                </div>
                                <Progress value={p.progress} className="h-2" />
                              </div>
                              <Button className="w-full mt-3" onClick={() => handleOpenPetition(p.id)}>
                                Apoiar Agora
                              </Button>
                            </div>
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="hidden sm:flex" />
                    <CarouselNext className="hidden sm:flex" />
                  </Carousel>
                );
              }
              const gridCols =
                topDonated.length === 1 ? 'grid-cols-1' :
                topDonated.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
              return (
                <div className={`grid ${gridCols} gap-4`}>
                  {topDonated.map(p => (
                    <div key={p.id} className="w-full">
                      <div className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow h-full">
                        <div className="h-40 bg-muted relative">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/5">
                              <Megaphone className="w-10 h-10 text-primary/30" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 space-y-2">
                          <h3 className="font-bold line-clamp-2">{p.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                          <div className="mt-2">
                            <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1">
                              <span>{p.signatureCount} assinaturas</span>
                              <span>Meta {p.goal || 100}</span>
                            </div>
                            <Progress value={p.progress} className="h-2" />
                          </div>
                          <Button className="w-full mt-3" onClick={() => handleOpenPetition(p.id)}>
                            Apoiar Agora
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : (
            <div className="p-6 border rounded-xl text-center bg-muted/30">
              <p className="text-muted-foreground">Ainda não há campanhas com doações registradas. Explore as broncas recentes e apoie uma causa.</p>
            </div>
          )}
        </div>
      </section>

      {showReportModal && (
        <ReportModal 
          onClose={() => setShowReportModal(false)} 
          onSubmit={handleCreateReport} 
        />
      )}
      
      {selectedReport && (
        <ReportDetails 
          report={selectedReport} 
          onClose={() => setSelectedReport(null)} 
          onUpdate={handleUpdateReport} 
          onUpvote={handleUpvoteWithRefresh}
          onLink={handleOpenLinkModal} 
          onFavoriteToggle={handleFavoriteToggleWithRefresh} 
        />
      )}
      
      {showLinkModal && reportToLink && (
        <LinkReportModal
          sourceReport={reportToLink}
          allReports={reports}
          onClose={() => setShowLinkModal(false)}
          onLink={handleLinkReport}
        />
      )}
    </div>
  );
}

export default HomePage;
