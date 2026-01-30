import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Search, Filter, FileSignature, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  const fetchReports = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('reports')
      .select('*, pole_number, category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), report_media(*), upvotes:upvotes(count), timeline:report_timeline(*), favorite_reports!left(*), petitions(id)')
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
        petition_id: r.petitions && r.petitions.length > 0 ? r.petitions[0].id : null,
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



  const handleTransformToPetition = async (report) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Faça login como administrador para transformar em abaixo-assinado.", variant: "destructive" });
      return;
    }
    
    try {
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
  
        // Atualizar flag na bronca
        const { error: updateReportError } = await supabase
          .from('reports')
          .update({ is_petition: true })
          .eq('id', report.id);
  
        if (updateReportError) console.error("Erro ao atualizar flag na bronca:", updateReportError);
  
        toast({
          title: "Abaixo-Assinado Criado! 🎉",
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
            <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
              <SelectTrigger><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="in-progress">Em Andamento</SelectItem>
                <SelectItem value="resolved">Resolvido</SelectItem>
                <SelectItem value="duplicate">Duplicada</SelectItem>
                <SelectItem value="pending_resolution">Verificando Resolução</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.category} onValueChange={(v) => handleFilterChange('category', v)}>
              <SelectTrigger><SelectValue placeholder="Filtrar por categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Categorias</SelectItem>
                {Object.entries(categories).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <div className="space-y-3">
                {filteredReports.map(report => (
                  <div key={report.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                    <div>
                      <p className="font-semibold">{report.title}</p>
                      <p className="text-sm text-muted-foreground">Autor: {report.author?.name || 'N/A'} | Status: <span className="font-medium">{report.status}</span></p>
                    </div>
                    <div className="flex-shrink-0 flex gap-2 items-center">
                      {report.is_petition ? (
                        <a href={report.petition_id ? `/abaixo-assinado/${report.petition_id}` : '/admin/assinaturas'} target="_blank" rel="noopener noreferrer">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-100" 
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Acompanhar
                          </Button>
                        </a>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100" 
                          onClick={() => handleTransformToPetition(report)}
                        >
                          <FileSignature className="w-4 h-4 mr-2" />
                          Gerar Petição
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setSelectedReport(report)} title="Editar"><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingReport(report)} title="Excluir"><Trash2 className="w-4 h-4" /></Button>
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
