import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { List, Map as MapIcon, Filter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import MapView from '@/components/MapView';
import ReportModal from '@/components/ReportModal';
import ReportDetails from '@/components/ReportDetails';
import StatsCards from '@/components/StatsCards';
import ReportList from '@/components/ReportList';
import LinkReportModal from '@/components/LinkReportModal';
import RankingSidebar from '@/components/RankingSidebar';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
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
          category:categories(name, icon),
          author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config),
          upvotes:upvotes(count),
          user_upvotes:upvotes(user_id),
          comments:comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)),
          comments_count:comments(count),
          report_media(*),
          favorite_reports(user_id)
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
    
    // Configurar realtime subscription
    const channel = supabase.channel('realtime reports')
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
          table: 'upvotes'
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialData, fetchReports]);

  const categoryCounts = useMemo(() => {
    const counts = reports.reduce((acc, report) => {
      const categoryId = report.category_id;
      if (categoryId) {
        acc[categoryId] = (acc[categoryId] || 0) + 1;
      }
      return acc;
    }, {});
    return counts;
  }, [reports]);

  useEffect(() => {
    let tempReports = reports.filter(r => r.status !== 'duplicate');

    if (filter.status === 'active') {
      tempReports = tempReports.filter(r => r.status === 'pending' || r.status === 'in-progress');
    } else if (filter.status === 'my-resolved') {
      tempReports = tempReports.filter(r => r.status === 'resolved' && user && r.author_id === user.id);
    } else if (filter.status !== 'all') {
      tempReports = tempReports.filter(r => r.status === filter.status);
    }
    
    if (filter.category !== 'all') {
      tempReports = tempReports.filter(r => r.category_id === filter.category);
    }
    setFilteredReports(tempReports);
  }, [reports, filter, user]);

  useEffect(() => {
    const activeReports = reports.filter(r => r.status !== 'duplicate');
    const pending = activeReports.filter(r => r.status === 'pending').length;
    const inProgress = activeReports.filter(r => r.status === 'in-progress').length;
    const userResolved = user 
      ? activeReports.filter(r => r.status === 'resolved' && r.author_id === user.id).length
      : 0;
    const total = pending + inProgress;
    setStats({ total, pending, inProgress, resolved: userResolved });
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

    const { title, description, category, address, location } = newReportData;
 
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

  return (
    <div className="container mx-auto px-4 py-6">
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
        className="mt-8"
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 relative z-40">
          <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border">
            <Button 
              variant={viewMode === 'map' ? 'default' : 'ghost'} 
              onClick={() => setViewMode('map')} 
              className={`gap-2 ${viewMode === 'map' ? 'bg-tc-yellow text-tc-black hover:bg-tc-yellow/90' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <MapIcon className="w-4 h-4" /> Mapa
            </Button>
            <Button 
              variant={viewMode === 'list' ? 'default' : 'ghost'} 
              onClick={() => setViewMode('list')} 
              className={`gap-2 ${viewMode === 'list' ? 'bg-tc-yellow text-tc-black hover:bg-tc-yellow/90' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <List className="w-4 h-4" /> Lista
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 text-muted-foreground hover:bg-muted">
                  <Filter className="w-4 h-4" />
                  <span className="hidden md:inline">Filtrar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 bg-card text-foreground border border-border">
                <DropdownMenuLabel className="text-tc-red">Status</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuRadioGroup value={filter.status} onValueChange={(value) => setFilter(f => ({...f, status: value}))}>
                  <DropdownMenuRadioItem value="active">Ativas (Pendentes/Em Andamento)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pending">Pendentes</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="in-progress">Em Andamento</DropdownMenuRadioItem>
                  {user && <DropdownMenuRadioItem value="my-resolved">Minhas Resolvidas</DropdownMenuRadioItem>}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuLabel className="text-tc-red">Categoria</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuRadioGroup value={filter.category} onValueChange={(value) => setFilter(f => ({...f, category: value}))}>
                  <DropdownMenuRadioItem value="all">Todas as Categorias</DropdownMenuRadioItem>
                  {categories.map(cat => (
                    <DropdownMenuRadioItem key={cat.id} value={cat.id} className="flex justify-between items-center">
                      <span>{cat.icon} {cat.name}</span>
                      <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                        {categoryCounts[cat.id] || 0}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
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