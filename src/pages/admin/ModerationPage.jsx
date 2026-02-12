import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Check, X, Eye, ChevronLeft, ChevronRight, Search, 
  MessageSquare, AlertCircle, FileText, CheckCircle2, Info, 
  Filter, Calendar, User, Clock
} from 'lucide-react';
import ReportDetails from '@/components/ReportDetails';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ModerationPage = () => {
  const { type } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);

  // Pagination, Search, Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  // Modal states
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [itemToReject, setItemToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [itemToApprove, setItemToApprove] = useState(null);

  const isReportModeration = type === 'broncas';
  const isResolutionModeration = type === 'resolucoes';
  const isPetitionModeration = type === 'peticoes';
  
  const pageTitle = isResolutionModeration ? 'Moderação de Resoluções' : 
                   isReportModeration ? 'Moderação de Broncas' : 
                   isPetitionModeration ? 'Moderação de Abaixo-Assinados' :
                   'Moderação de Comentários';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    
    try {
      if (isResolutionModeration) {
        const { data, error } = await supabase
          .from('reports')
          .select('*, author:profiles!author_id(name)')
          .eq('status', 'pending_resolution')
          .not('resolution_submission', 'is', null)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else if (isPetitionModeration) {
        const { data, error } = await supabase
          .from('petitions')
          .select('*, author:profiles!author_id(name)')
          .eq('status', 'pending_moderation')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else {
        const tableToFetch = isReportModeration ? 'reports' : 'comments';
        const statusField = 'moderation_status';
        const { data, error } = await supabase
          .from(tableToFetch)
          .select('*, author:profiles!author_id(name)')
          .eq(statusField, 'pending_approval')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      }
    } catch (error) {
      toast({ title: `Erro ao buscar itens`, description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isReportModeration, isResolutionModeration, isPetitionModeration, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAction = async (item, newStatus) => {
    if (newStatus === 'rejected') {
      setItemToReject(item);
      setIsRejectModalOpen(true);
    } else if (newStatus === 'approved') {
      setItemToApprove(item);
      setIsApproveModalOpen(true);
    }
  };

  const processAction = async (item, newStatus) => {
    try {
      if (isResolutionModeration) {
        let updateData = newStatus === 'approved' 
          ? { status: 'resolved', resolved_at: new Date().toISOString() }
          : { status: 'pending', resolution_submission: null };

        const { error } = await supabase.from('reports').update(updateData).eq('id', item.id);
        if (error) throw error;
      } else if (isPetitionModeration) {
        let updateData = newStatus === 'approved' 
          ? { status: 'open' }
          : { status: 'rejected', rejection_reason: rejectionReason };

        const { error } = await supabase.from('petitions').update(updateData).eq('id', item.id);
        if (error) throw error;

        // Criar notificação para o autor
        const notificationData = {
          user_id: item.author_id,
          type: 'moderation_update',
          title: newStatus === 'approved' ? 'Abaixo-assinado aprovado! 🎉' : 'Abaixo-assinado não aprovado',
          message: newStatus === 'approved' 
            ? `Seu abaixo-assinado "${item.title}" foi aprovado e já está disponível para assinaturas.`
            : `Infelizmente seu abaixo-assinado "${item.title}" não foi aprovado. Motivo: ${rejectionReason}`,
          link: `/abaixo-assinado/${item.id}`,
          is_read: false
        };

        await supabase.from('notifications').insert(notificationData);

        // Enviar e-mail de notificação
        try {
          await supabase.functions.invoke('send-petition-status-email', {
            body: {
              petitionId: item.id,
              authorId: item.author_id,
              status: newStatus,
              rejectionReason: newStatus === 'rejected' ? rejectionReason : null,
              petitionTitle: item.title,
              petitionUrl: `${window.location.origin}/abaixo-assinado/${item.id}`
            }
          });
        } catch (emailError) {
          console.error('Erro ao enviar e-mail de notificação:', emailError);
          // Não falhar o processo se o e-mail falhar, mas avisar no log
        }
      } else {
        const tableToUpdate = isReportModeration ? 'reports' : 'comments';
        let updateData = { moderation_status: newStatus };
        if (isReportModeration && newStatus === 'approved') updateData.status = 'pending';

        const { error } = await supabase.from(tableToUpdate).update(updateData).eq('id', item.id);
        if (error) throw error;
      }

      toast({ title: `Item ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso!` });
      fetchItems();
    } catch (error) {
      toast({ title: "Erro ao processar", description: error.message, variant: "destructive" });
    }
  };

  const confirmRejection = async () => {
    if (!itemToReject) return;
    await processAction(itemToReject, 'rejected');
    setIsRejectModalOpen(false);
    setItemToReject(null);
    setRejectionReason('');
  };

  const confirmApproval = async () => {
    if (!itemToApprove) return;
    await processAction(itemToApprove, 'approved');
    setIsApproveModalOpen(false);
    setItemToApprove(null);
  };

  // Filter and Pagination Logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const title = item.title || item.text || '';
      const authorName = item.author?.name || item.resolution_submission?.userName || '';
      return title.toLowerCase().includes(searchLower) || authorName.toLowerCase().includes(searchLower);
    });
  }, [items, searchTerm]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const currentItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const handleViewReport = async (reportId) => {
    const { data, error } = await supabase
      .from('reports')
      .select('*, author:profiles!reports_author_id_fkey(name, avatar_url), comments(*), report_media(*), timeline:report_timeline(*), upvotes:upvotes(count)')
      .eq('id', reportId)
      .single();

    if (error) {
      toast({ title: "Erro ao buscar detalhes", description: error.message, variant: "destructive" });
    } else {
      const formattedData = {
        ...data,
        location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
        photos: (data.report_media || []).filter(m => m.type === 'photo'),
        videos: (data.report_media || []).filter(m => m.type === 'video'),
        upvotes: data.upvotes[0]?.count || 0,
      };
      setSelectedReport(formattedData);
    }
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle} - Admin</title>
      </Helmet>
      
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 md:mb-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 md:gap-3">
              <Link to="/admin">
                <Button variant="ghost" size="icon" className="rounded-full shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{pageTitle}</h1>
            </div>
            <p className="text-muted-foreground ml-10 md:ml-12 text-sm md:text-base">
              {isResolutionModeration ? 'Valide as resoluções enviadas' : 'Garanta a qualidade do conteúdo da plataforma'}
            </p>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-10 h-11 bg-muted/50 border-none shadow-sm w-full"
            />
          </div>
        </div>

        {/* Content List */}
        <div className="grid gap-4">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-tc-red border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground animate-pulse">Carregando itens para moderação...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <Card className="border-dashed border-2 py-20 flex flex-col items-center justify-center text-center bg-muted/20">
              <div className="bg-muted p-4 rounded-full mb-4 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold mb-1">Tudo limpo por aqui!</h3>
              <p className="text-muted-foreground max-w-sm">Não há nenhum item pendente de moderação nesta categoria.</p>
            </Card>
          ) : (
            <AnimatePresence mode="popLayout">
              {currentItems.map((item) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  key={item.id}
                >
                  <Card className="overflow-hidden border-muted-foreground/10 hover:border-tc-red/20 transition-all shadow-sm hover:shadow-md">
                    <CardContent className="p-0">
                      <div className="flex flex-row items-stretch min-h-[110px] md:min-h-[130px]">
                        {/* Icon/Visual Indicator - Always vertical stripe */}
                        <div className={`w-1.5 md:w-2 shrink-0 ${isPetitionModeration ? 'bg-tc-red' : isResolutionModeration ? 'bg-green-500' : 'bg-blue-500'}`} />
                        
                        <div className="flex-1 p-2.5 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-6 min-w-0">
                          <div className="space-y-1 md:space-y-2 flex-1 min-w-0 w-full">
                            <div className="flex items-center gap-1.5 md:gap-3 flex-wrap mb-0.5">
                              <Badge variant="outline" className="gap-1 font-medium py-0 h-5 md:h-6 text-[9px] md:text-xs">
                                {isPetitionModeration ? <FileText className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" /> : isResolutionModeration ? <CheckCircle2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" /> : <MessageSquare className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />}
                                {isPetitionModeration ? 'Abaixo-Assinado' : isResolutionModeration ? 'Resolução' : 'Comentário'}
                              </Badge>
                              <span className="text-[9px] md:text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                                {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            
                            <h3 className="font-bold text-sm md:text-lg leading-tight line-clamp-2 group-hover:text-tc-red transition-colors">
                              {item.title || (item.text ? `"${item.text}"` : 'Sem título')}
                            </h3>
                            
                            <div className="flex flex-col xs:flex-row xs:items-center gap-1.5 xs:gap-4 text-[10px] md:text-sm text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                <span className="font-medium text-foreground truncate max-w-[90px] sm:max-w-none">{item.author?.name || item.resolution_submission?.userName || 'Anônimo'}</span>
                              </div>
                              {item.protocol && (
                                <div className="flex items-center gap-1.5">
                                  <Info className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  <span>Prot: <span className="font-mono text-[9px] md:text-xs">{item.protocol}</span></span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 md:gap-3 shrink-0 self-end md:self-center bg-muted/30 p-1.5 md:p-2 rounded-xl w-full sm:w-auto justify-end border-t border-muted sm:border-0 pt-2 sm:pt-2 mt-1 sm:mt-0">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 md:h-10 px-2.5 md:px-4 hover:bg-background flex-1 sm:flex-none text-[11px] md:text-sm"
                              onClick={() => isPetitionModeration ? navigate(`/abaixo-assinado/${item.id}`) : handleViewReport(item.id)}
                            >
                              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                              Revisar
                            </Button>
                            
                            <div className="hidden sm:block w-px h-6 bg-muted-foreground/20 mx-1" />
                            
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 md:h-10 md:w-10 text-green-600 hover:text-white hover:bg-green-600 rounded-lg transition-colors"
                                onClick={() => handleAction(item, 'approved')}
                              >
                                <Check className="w-4 h-4 md:w-5 md:h-5" />
                              </Button>
                              
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 md:h-10 md:w-10 text-red-600 hover:text-white hover:bg-red-600 rounded-lg transition-colors"
                                onClick={() => handleAction(item, 'rejected')}
                              >
                                <X className="w-4 h-4 md:w-5 md:h-5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Pagination */}
        {filteredItems.length > itemsPerPage && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mt-10">
            <Button
              variant="outline"
              className="rounded-xl h-10 gap-2 w-full sm:w-auto"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <div className="text-sm font-medium bg-muted px-4 py-2 rounded-lg w-full sm:w-auto text-center">
              Página <span className="text-tc-red">{currentPage}</span> de {totalPages}
            </div>
            <Button
              variant="outline"
              className="rounded-xl h-10 gap-2 w-full sm:w-auto"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Details View */}
      {selectedReport && (
        <ReportDetails
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={async (data) => {
            const { error } = await supabase.from('reports').update(data).eq('id', data.id);
            if (error) toast({ title: "Erro ao atualizar", variant: "destructive" });
            else { toast({ title: "Atualizado!" }); fetchItems(); setSelectedReport(null); }
          }}
          onUpvote={() => {}}
          onLink={() => {}}
          onFavoriteToggle={() => {}}
          isModerationView={true}
        />
      )}

      {/* Approve/Reject Dialogs (Simplified for better UX) */}
      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-500" /> Confirmar Aprovação
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Ao aprovar, este conteúdo ficará visível para todos os usuários da plataforma. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 gap-3">
            <Button variant="ghost" onClick={() => setIsApproveModalOpen(false)} className="rounded-xl h-12 flex-1">Cancelar</Button>
            <Button onClick={confirmApproval} className="bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 flex-1 shadow-lg shadow-green-200">Aprovar Agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" /> Motivo da Rejeição
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Explique por que este conteúdo não foi aprovado. O autor receberá esta justificativa.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea 
              value={rejectionReason} 
              onChange={(e) => setRejectionReason(e.target.value)} 
              placeholder="Ex: Conteúdo duplicado, informações incompletas..."
              className="min-h-[120px] rounded-xl border-2 focus-visible:ring-red-500 bg-muted/30"
            />
          </div>
          <DialogFooter className="gap-3">
            <Button variant="ghost" onClick={() => setIsRejectModalOpen(false)} className="rounded-xl h-12 flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={confirmRejection} disabled={!rejectionReason.trim()} className="rounded-xl h-12 flex-1 shadow-lg shadow-red-200">Confirmar Rejeição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModerationPage;
