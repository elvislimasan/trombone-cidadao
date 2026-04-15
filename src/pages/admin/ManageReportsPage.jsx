import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Search, Filter, FileSignature, ExternalLink, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import ReportDetails from '@/components/ReportDetails';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useUpvote } from '@/hooks/useUpvotes';

const ManageReportsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { handleUpvote: handleUpvoteHook } = useUpvote();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [filters, setFilters] = useState({ searchTerm: '', status: 'all', category: 'all' });
  const [selectedReport, setSelectedReport] = useState(null);
  const [deletingReport, setDeletingReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const categories = {
    'iluminacao': 'Iluminação Pública', 'buracos': 'Buracos na Via', 'esgoto': 'Esgoto Entupido',
    'limpeza': 'Limpeza Urbana', 'poda': 'Poda de Árvore', 'vazamento-de-agua': 'Vazamento de Água', 'outros': 'Outros',
  };

  const statusOptions = [
    { value: 'all', label: 'Todos os Status' },
    { value: 'pending', label: 'Pendente' },
    { value: 'in-progress', label: 'Em Andamento' },
    { value: 'resolved', label: 'Resolvido' },
    { value: 'duplicate', label: 'Duplicada' },
    { value: 'pending_resolution', label: 'Verificando Resolução' },
  ];

  const categoryOptions = [
    { value: 'all', label: 'Todas as Categorias' },
    ...Object.entries(categories).map(([value, label]) => ({ value, label }))
  ];

  const fetchReports = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('reports')
      .select('*, pole_number, category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), report_media(*), upvotes:upvotes(count), timeline:report_timeline(*), favorite_reports!left(*), petitions(id, status)')
      .order('created_at', { ascending: false });

    if (user) {
      query = query.eq('favorite_reports.user_id', user.id);
    }
      
    const { data, error } = await query;

    if (error) {
      toast({ title: "Erro ao buscar broncas", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(r => ({
        ...r,
        location: r.location ? { lat: r.location.coordinates[1], lng: r.location.coordinates[0] } : null,
        category: r.category_id,
        categoryName: r.category?.name,
        categoryIcon: r.category?.icon,
        authorName: r.author?.name || 'Anônimo',
        upvotes: r.upvotes[0]?.count || 0,
        comments: (r.comments || []).filter(c => c.moderation_status === 'approved'),
        photos: r.report_media.filter(m => m.type === 'photo'),
        videos: r.report_media.filter(m => m.type === 'video'),
        is_favorited: r.favorite_reports.length > 0,
        petitionId: r.petitions?.[0]?.id || null,
        petitionStatus: r.petitions?.[0]?.status || null,
      }));
      setReports(formattedData);
    }
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    let result = reports;
    if (filters.searchTerm) {
      result = result.filter(r =>
        r.title.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        r.description?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        r.protocol.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }
    if (filters.status !== 'all') {
      result = result.filter(r => r.status === filters.status);
    }
    if (filters.category !== 'all') {
      result = result.filter(r => r.category_id === filters.category);
    }
    setFilteredReports(result);
  }, [filters, reports]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleUpvote = async (id) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login');
      return;
    }

    // Call the hook
    const result = await handleUpvoteHook(id);

    if (result.success) {
      fetchReports();
      toast({ title: result.action === 'added' ? "Apoio registrado! 👍" : "Apoio removido." });
    } else {
      toast({ title: "Erro ao apoiar", description: result.error, variant: "destructive" });
    }
  };

  const handleToggleFeatured = async (report) => {
    try {
      const toggled = !report.is_featured;
      const updates = { is_featured: toggled, featured_at: toggled ? new Date().toISOString() : null };
      const { error } = await supabase.from('reports').update(updates).eq('id', report.id);
      if (error) throw error;
      toast({
        title: toggled ? 'Marcada como destaque' : 'Removida dos destaques',
        description: toggled ? 'Esta bronca aparecerá na Home em Destaques.' : 'Esta bronca não aparecerá mais em Destaques.'
      });
      fetchReports();
      if (selectedReport?.id === report.id) {
        setSelectedReport(prev => ({ ...prev, ...updates }));
      }
    } catch (e) {
      toast({ title: 'Erro ao alterar destaque', description: e.message, variant: 'destructive' });
    }
  };



  const handleTransformToPetition = async (report) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Faça login como administrador para transformar em abaixo-assinado.", variant: "destructive" });
      return;
    }
    
    try {
        // Verificar se já existe uma petição para esta bronca
        const { data: existingPetitions, error: checkError } = await supabase
          .from('petitions')
          .select('id')
          .eq('report_id', report.id)
          .limit(1);

        if (checkError) throw checkError;

        if (existingPetitions && existingPetitions.length > 0) {
          // Se já existe, apenas redireciona para o editor
          navigate(`/abaixo-assinado/${existingPetitions[0].id}?edit=true`);
          return;
        }

        const petitionData = {
          title: report.title,
          target: '', // Deixar vazio para preencher no editor
          description: report.description,
          goal: 100,
          report_id: report.id,
          author_id: user.id,
          status: 'draft',
          image_url: report.photos && report.photos.length > 0 ? report.photos[0].url : null
        };
  
        const { data: newPetition, error: createError } = await supabase
          .from('petitions')
          .insert(petitionData)
          .select()
          .single();
  
        if (createError) throw createError;
  
        // REMOVIDO: Não atualizar a flag is_petition na bronca imediatamente.
        // Isso só deve acontecer quando o usuário salvar a petição no editor.
  
        toast({
          title: "Editor Iniciado",
          description: "Redirecionando para o editor para finalizar os detalhes.",
        });
  
        navigate(`/abaixo-assinado/${newPetition.id}?edit=true`);
  
      } catch (error) {
        console.error(error);
        toast({
          title: "Erro ao criar",
          description: error.message,
          variant: "destructive"
        });
      }
  };

  const handleUpdateReport = async (editData) => {
    const { 
      id,
      title,
      description,
      address,
      location,
      category_id,
      pole_number,
      pole_id,
      reported_post_identifier,
      reported_plate,
      reported_pole_distance_m,
      newPhotos,
      newVideos,
      removedMedia,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      is_from_water_utility,
      moderation_status,
      rejection_title,
      rejection_description,
      rejected_at
    } = editData;

    const reportUpdates = {};
    if (typeof title !== 'undefined') reportUpdates.title = title;
    if (typeof description !== 'undefined') reportUpdates.description = description;
    if (typeof address !== 'undefined') reportUpdates.address = address;
    if (typeof category_id !== 'undefined') reportUpdates.category_id = category_id;
    if (typeof status !== 'undefined') reportUpdates.status = status;
    if (typeof is_recurrent !== 'undefined') reportUpdates.is_recurrent = is_recurrent;
    if (typeof evaluation !== 'undefined') reportUpdates.evaluation = evaluation;
    if (typeof resolution_submission !== 'undefined') reportUpdates.resolution_submission = resolution_submission;
    if (typeof moderation_status !== 'undefined') reportUpdates.moderation_status = moderation_status;
    if (typeof rejection_title !== 'undefined') reportUpdates.rejection_title = rejection_title;
    if (typeof rejection_description !== 'undefined') reportUpdates.rejection_description = rejection_description;
    if (typeof rejected_at !== 'undefined') reportUpdates.rejected_at = rejected_at;

    if (typeof is_from_water_utility !== 'undefined' && typeof category_id !== 'undefined') {
      reportUpdates.is_from_water_utility = category_id === 'buracos' ? !!is_from_water_utility : null;
    }

    if (typeof category_id !== 'undefined') {
      if (category_id === 'iluminacao') {
        if (typeof pole_number !== 'undefined') {
          reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
        }
        if (typeof pole_id !== 'undefined') reportUpdates.pole_id = pole_id || null;
        if (typeof reported_post_identifier !== 'undefined') reportUpdates.reported_post_identifier = reported_post_identifier ? String(reported_post_identifier).trim() : null;
        if (typeof reported_plate !== 'undefined') reportUpdates.reported_plate = reported_plate ? String(reported_plate).trim() : null;
        if (typeof reported_pole_distance_m !== 'undefined') {
          if (reported_pole_distance_m == null) reportUpdates.reported_pole_distance_m = null;
          else {
            const n = Number(reported_pole_distance_m);
            reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
          }
        }
      } else {
        reportUpdates.pole_number = null;
        reportUpdates.pole_id = null;
        reportUpdates.reported_post_identifier = null;
        reportUpdates.reported_plate = null;
        reportUpdates.reported_pole_distance_m = null;
      }
    } else if (typeof pole_number !== 'undefined') {
      reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
      if (typeof pole_id !== 'undefined') reportUpdates.pole_id = pole_id || null;
      if (typeof reported_post_identifier !== 'undefined') reportUpdates.reported_post_identifier = reported_post_identifier ? String(reported_post_identifier).trim() : null;
      if (typeof reported_plate !== 'undefined') reportUpdates.reported_plate = reported_plate ? String(reported_plate).trim() : null;
      if (typeof reported_pole_distance_m !== 'undefined') {
        if (reported_pole_distance_m == null) reportUpdates.reported_pole_distance_m = null;
        else {
          const n = Number(reported_pole_distance_m);
          reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
        }
      }
    }

    if (location) reportUpdates.location = `POINT(${location.lng} ${location.lat})`;

    const { error: updateError } = await supabase.from('reports').update(reportUpdates).eq('id', id);
    if (updateError) {
      toast({ title: "Erro ao atualizar dados", description: updateError.message, variant: "destructive" });
      return;
    }
    
    if (removedMedia && removedMedia.length > 0) {
      const { error: deleteMediaError } = await supabase
        .from('report_media')
        .delete()
        .in('id', removedMedia);

      if (deleteMediaError) {
        toast({ title: "Erro ao remover mídia antiga", description: deleteMediaError.message, variant: "destructive" });
        return;
      }

      const mediaToRemoveFromStorage = reports
        .find(r => r.id === id)
        ?.report_media.filter(m => removedMedia.includes(m.id));

      if (mediaToRemoveFromStorage && mediaToRemoveFromStorage.length > 0) {
        const pathsToRemove = mediaToRemoveFromStorage.map(m => new URL(m.url).pathname.split('/reports-media/')[1]).filter(Boolean);
        if (pathsToRemove.length > 0) {
          await supabase.storage.from('reports-media').remove(pathsToRemove);
        }
      }
    }

    toast({ title: "Bronca atualizada com sucesso!" });
    fetchReports();
    setSelectedReport(null);
  };
  
  const handleFavoriteToggle = async (reportId, isFavorited) => {
    if (!user) {
      toast({ title: "Ação necessária", description: "Você precisa estar logado para favoritar.", variant: "destructive" });
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro", description: "Não foi possível remover dos favoritos.", variant: "destructive" });
      } else {
        toast({ title: "Sucesso", description: "Removido dos seus favoritos." });
      }
    } else {
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro", description: "Não foi possível adicionar aos favoritos.", variant: "destructive" });
      } else {
        toast({ title: "Sucesso", description: "Adicionado aos seus favoritos!" });
      }
    }
    fetchReports();
    if(selectedReport?.id === reportId) {
       setSelectedReport(prev => ({...prev, is_favorited: !isFavorited}));
    }
  };

  const handleDeleteReport = async () => {
    if (!deletingReport) return;
    
    // Delete media from storage first
    if (deletingReport.report_media && deletingReport.report_media.length > 0) {
        const pathsToDelete = deletingReport.report_media.map(media => {
            try {
                const url = new URL(media.url);
                const path = url.pathname.split('/reports-media/')[1];
                return path;
            } catch (e) {
                console.error("URL inválida:", media.url);
                return null;
            }
        }).filter(Boolean);
        
        if (pathsToDelete.length > 0) {
            const { error: storageError } = await supabase.storage.from('reports-media').remove(pathsToDelete);
            if (storageError) {
                toast({ title: "Erro ao remover mídias do armazenamento", description: storageError.message, variant: "destructive" });
                // We can decide to stop here or continue
            }
        }
    }
  
    // Now delete from database tables
    const { error } = await supabase.from('reports').delete().eq('id', deletingReport.id);

    if (error) {
      toast({ title: "Erro ao remover bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca removida com sucesso!", variant: "destructive" });
      fetchReports();
    }
    setDeletingReport(null);
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Broncas - Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Broncas</h1>
              <p className="mt-2 text-lg text-muted-foreground">Central de controle para todas as solicitações.</p>
            </div>
          </div>
        </motion.div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" /> Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por título, protocolo..." className="pl-10" value={filters.searchTerm} onChange={(e) => handleFilterChange('searchTerm', e.target.value)} />
            </div>
            <Combobox
              value={filters.status}
              onChange={(v) => handleFilterChange('status', v)}
              options={statusOptions}
              placeholder="Filtrar por status"
              searchPlaceholder="Buscar status..."
            />
            <Combobox
              value={filters.category}
              onChange={(v) => handleFilterChange('category', v)}
              options={categoryOptions}
              placeholder="Filtrar por categoria"
              searchPlaceholder="Buscar categoria..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Broncas</CardTitle>
            <CardDescription>{filteredReports.length} broncas encontradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Carregando broncas...</p>
            ) : (
              <div className="space-y-2 md:space-y-3">
                {filteredReports.map(report => (
                  <div key={report.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 md:p-4 bg-background rounded-lg border gap-3 md:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm md:text-base truncate">{report.title}</p>
                      <p className="text-[10px] md:text-sm text-muted-foreground">Autor: {report.author?.name || 'N/A'} | Status: <span className="font-medium">{report.status}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                      {report.petitionId ? (
                        <a href={`/abaixo-assinado/${report.petitionId}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full sm:w-auto text-blue-600 hover:text-blue-700 hover:bg-blue-100 h-8 md:h-9 text-[10px] md:text-xs px-2" 
                          >
                            <ExternalLink className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
                            Acompanhar ({report.petitionStatus})
                          </Button>
                        </a>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="flex-1 sm:flex-none text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100 h-8 md:h-9 text-[10px] md:text-xs px-2" 
                          onClick={() => handleTransformToPetition(report)}
                        >
                          <FileSignature className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
                          Gerar Petição
                        </Button>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 md:h-9 md:w-9 ${report.is_featured ? 'text-yellow-500 hover:text-yellow-600' : ''}`}
                          onClick={() => handleToggleFeatured(report)}
                          title={report.is_featured ? 'Remover destaque' : 'Marcar como destaque'}
                        >
                          <Star className={`w-3 h-3 md:w-4 md:h-4 ${report.is_featured ? 'fill-yellow-400' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" onClick={() => setSelectedReport(report)} title="Editar"><Edit className="w-3 h-3 md:w-4 md:h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9 text-red-500 hover:text-red-600" onClick={() => setDeletingReport(report)} title="Excluir"><Trash2 className="w-3 h-3 md:w-4 md:h-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedReport && (
        <ReportDetails
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={handleUpdateReport}
          onUpvote={handleUpvote}
          onLink={() => {}}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}

      <Dialog open={!!deletingReport} onOpenChange={(open) => !open && setDeletingReport(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a bronca "{deletingReport?.title}"? Esta ação é irreversível e removerá todos os comentários e mídias associados.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDeleteReport}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};

export default ManageReportsPage;
