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

  const fetchInitialData = useCallback(async () => {
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
    toast({ 
      title: "Erro ao buscar broncas", 
      description: `Erro: ${reportsError.message}`,
      variant: "destructive" 
    });
    console.error('Erro detalhado:', reportsError);
  } else {
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
  }

  const { data: categoriesData, error: categoriesError } = await supabase
    .from('categories')
    .select('*');
    
  if (categoriesError) {
    toast({ 
      title: "Erro ao buscar categorias", 
      description: categoriesError.message, 
      variant: "destructive" 
    });
  } else {
    setCategories(categoriesData);
  }
}, [toast, user]);

  useEffect(() => {
    fetchInitialData();
    const channel = supabase.channel('realtime reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (payload) => {
        fetchInitialData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialData]);

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
      console.log(error);
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
  };

  const handleUpdateReport = async (editData) => {
    const { id, title, description, address, location, category_id, newPhotos, newVideos, removedMedia, status, is_recurrent, evaluation, resolution_submission } = editData;

    const reportUpdates = { title, description, address, category_id, status, is_recurrent, evaluation, resolution_submission };
    if (location) {
      reportUpdates.location = `POINT(${location.lng} ${location.lat})`;
    }

    const { error: updateError } = await supabase.from('reports').update(reportUpdates).eq('id', id);
    if (updateError) {
      toast({ title: "Erro ao atualizar dados", description: updateError.message, variant: "destructive" });
      return;
    }

    if (removedMedia && removedMedia.length > 0) {
      const { error: deleteError } = await supabase.from('report_media').delete().in('id', removedMedia);
      if (deleteError) {
        toast({ title: "Erro ao remover mídia antiga", description: deleteError.message, variant: "destructive" });
      }
    }

    const mediaToUpload = [
      ...(newPhotos || []).map(p => ({ ...p, type: 'photo' })),
      ...(newVideos || []).map(v => ({ ...v, type: 'video' }))
    ];

    if (mediaToUpload.length > 0) {
      const uploadPromises = mediaToUpload.map(async (media) => {
        const filePath = `${user.id}/${id}/${Date.now()}-${media.name}`;
        const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, media.file);
        if (uploadError) throw new Error(`Falha no upload de ${media.name}: ${uploadError.message}`);
        const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
        return { report_id: id, url: publicUrl, type: media.type, name: media.name };
      });

      try {
        const uploadedMedia = await Promise.all(uploadPromises);
        if (uploadedMedia.length > 0) {
          const { error: insertError } = await supabase.from('report_media').insert(uploadedMedia);
          if (insertError) throw new Error(`Falha ao salvar mídia: ${insertError.message}`);
        }
      } catch (error) {
        toast({ title: "Erro no upload de nova mídia", description: error.message, variant: "destructive" });
      }
    }
    
    toast({ title: "Bronca atualizada com sucesso! ✨" });
    setSelectedReport(null);
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
		const { error } = await supabase
			.from('reports')
			.update({ status: 'duplicate', linked_to: targetReportId })
			.eq('id', sourceReportId);

		if (error) {
			toast({ title: "Erro ao vincular bronca", description: error.message, variant: "destructive" });
		} else {
			toast({ title: "Bronca vinculada! 🔗", description: "A solicitação foi marcada como duplicada." });
			setShowLinkModal(false);
			setReportToLink(null);
			setSelectedReport(null);
		}
	};

  const handleFavoriteToggle = async (reportId, isFavorited) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para favoritar.", variant: "destructive" });
      navigate('/login');
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao desfavoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Removido dos favoritos! 💔" });
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, is_favorited: false } : r));
        if (selectedReport?.id === reportId) {
          setSelectedReport(prev => ({ ...prev, is_favorited: false }));
        }
      }
    } else {
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Adicionado aos favoritos! ⭐" });
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, is_favorited: true } : r));
        if (selectedReport?.id === reportId) {
          setSelectedReport(prev => ({ ...prev, is_favorited: true }));
        }
      }
    }
  };

  const handleSelectReport = (report) => {
    setSelectedReport(report);
  };

  const handleStatsCardClick = (status) => {
    setFilter(f => ({ ...f, status, category: 'all' }));
    viewContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
        <StatsCards stats={stats} onCardClick={handleStatsCardClick} user={user} />
      </motion.div>

      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 relative z-40">
          <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border">
            <Button variant={viewMode === 'map' ? 'default' : 'ghost'} onClick={() => setViewMode('map')} className={`gap-2 ${viewMode === 'map' ? 'bg-tc-yellow text-tc-black hover:bg-tc-yellow/90' : 'text-muted-foreground hover:bg-muted'}`}>
              <MapIcon className="w-4 h-4" /> Mapa
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')} className={`gap-2 ${viewMode === 'list' ? 'bg-tc-yellow text-tc-black hover:bg-tc-yellow/90' : 'text-muted-foreground hover:bg-muted'}`}>
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
                      <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{categoryCounts[cat.id] || 0}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={handleNewReportClick} className="bg-tc-red hover:bg-tc-red/90 gap-2 text-tc-white hidden md:flex">
              <Plus className="w-4 h-4" /> Nova Bronca
            </Button>
          </div>
        </div>

        <div ref={viewContainerRef} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
            {viewMode === 'map' ? (
              <div className="h-[600px] relative">
                <MapView reports={filteredReports} onReportClick={handleSelectReport} onUpvote={() => handleUpvote(selectedReport.id, selectedReport.upvotes, selectedReport.user_has_upvoted)} />
              </div>
            ) : (
              <ReportList reports={filteredReports} onReportClick={handleSelectReport} />
            )}
          </div>
          <div className="lg:col-span-1">
            <RankingSidebar reports={reports} onReportClick={handleSelectReport} />
          </div>
        </div>
      </motion.div>

      {showReportModal && <ReportModal onClose={() => setShowReportModal(false)} onSubmit={handleCreateReport} />}
      {selectedReport && <ReportDetails report={selectedReport} onClose={() => setSelectedReport(null)} onUpdate={handleUpdateReport} onUpvote={() => handleUpvote(selectedReport.id, selectedReport.upvotes, selectedReport.user_has_upvoted)} onLink={handleOpenLinkModal} onFavoriteToggle={handleFavoriteToggle} />}
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