import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, X, Eye } from 'lucide-react';
import ReportDetails from '@/components/ReportDetails';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ModerationPage = () => {
  const { type } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);

  const isReportModeration = type === 'broncas';
  const isResolutionModeration = type === 'resolucoes';
  const pageTitle = isResolutionModeration ? 'Moderação de Resoluções' : 
                   isReportModeration ? 'Moderação de Broncas' : 
                   'Moderação de Comentários';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    
    if (isResolutionModeration) {
      // Buscar broncas com resolução pendente
      const { data, error } = await supabase
        .from('reports')
        .select('*, author:profiles!author_id(name)')
        .eq('status', 'pending_resolution')
        .not('resolution_submission', 'is', null)
        .order('created_at', { ascending: true });

      if (error) {
        toast({ title: `Erro ao buscar resoluções pendentes`, description: error.message, variant: "destructive" });
      } else {
        setItems(data || []);
      }
    } else {
      // Moderação normal de broncas ou comentários
      const tableToFetch = isReportModeration ? 'reports' : 'comments';
      const statusFilter = isReportModeration ? 'moderation_status' : 'moderation_status';
      
      const { data, error } = await supabase
        .from(tableToFetch)
        .select('*, author:profiles!author_id(name)')
        .eq(statusFilter, 'pending_approval')
        .order('created_at', { ascending: true });

      if (error) {
        toast({ title: `Erro ao buscar itens para moderação`, description: error.message, variant: "destructive" });
      } else {
        setItems(data);
      }
    }
    setLoading(false);
  }, [isReportModeration, isResolutionModeration, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAction = async (item, newStatus) => {
    if (isResolutionModeration) {
      // Ações específicas para moderação de resoluções
      let updateData = {};
      
      if (newStatus === 'approved') {
        updateData = { 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        };
      } else if (newStatus === 'rejected') {
        updateData = { 
          status: 'pending',
          resolution_submission: null
        };
      }

      const { error } = await supabase
        .from('reports')
        .update(updateData)
        .eq('id', item.id);

      if (error) {
        toast({ title: "Erro ao processar resolução", description: error.message, variant: "destructive" });
      } else {
        const actionText = newStatus === 'approved' ? 'aprovada' : 'rejeitada';
        toast({ 
          title: `Resolução ${actionText} com sucesso!`,
          description: newStatus === 'approved' 
            ? 'A bronca foi marcada como resolvida.' 
            : 'A bronca voltou para o status pendente.'
        });
        fetchItems();
      }
    } else {
      // Moderação normal de broncas ou comentários
      const tableToUpdate = isReportModeration ? 'reports' : 'comments';
      let updateData = { moderation_status: newStatus };

      if (isReportModeration && newStatus === 'approved') {
        updateData.status = 'pending';
      }

      const { error } = await supabase
        .from(tableToUpdate)
        .update(updateData)
        .eq('id', item.id);

      if (error) {
        toast({ title: "Erro ao moderar item", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `Item ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso!` });
        fetchItems();
      }
    }
  };
    const handleUpvote = async (id) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login');
      return;
    }
    const { error } = await supabase.rpc('increment_upvotes', { report_id_param: id });
    if (error) {
      toast({ title: "Erro ao apoiar", description: error.message, variant: "destructive" });
    } else {
      fetchReport();
      toast({ title: "Apoio registrado! 👍" });
    }
  };

  const handleViewReport = async (reportId) => {
    const { data, error } = await supabase
      .from('reports')
      .select('*, author:profiles!reports_author_id_fkey(name, avatar_url), comments(*), report_media(*), timeline:report_timeline(*), upvotes:upvotes(count)')
      .eq('id', reportId)
      .single();

    if (error) {
      toast({ title: "Erro ao buscar detalhes da bronca", description: error.message, variant: "destructive" });
    } else {
      const formattedData = {
        ...data,
        location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
        photos: (data.report_media || []).filter(m => m.type === 'photo'),
        videos: (data.report_media || []).filter(m => m.type === 'video'),
        upvotes: data.upvotes[0]?.count || 0,
        is_favorited: false,
      };
      setSelectedReport(formattedData);
    }
  };
  
  const handleUpdateOnModeration = async (updateData) => {
    const { error } = await supabase.from('reports').update(updateData).eq('id', updateData.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca atualizada!" });
      fetchItems();
      setSelectedReport(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getItemDescription = (item) => {
    if (isResolutionModeration) {
      return `Resolução enviada por: ${item.resolution_submission?.userName || 'Usuário'} - ${formatDate(item.resolution_submission?.submittedAt)}`;
    }
    return `Enviado por: ${item.author?.name || 'Desconhecido'} em ${formatDate(item.created_at)}`;
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle} - Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="outline" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">{pageTitle}</h1>
              <p className="mt-2 text-lg text-muted-foreground">
                {isResolutionModeration 
                  ? 'Aprove ou rejeite as fotos de resolução enviadas pelos usuários.'
                  : 'Aprove ou rejeite as novas submissões.'
                }
              </p>
            </div>
          </div>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>
              {isResolutionModeration ? 'Resoluções Pendentes' : 'Itens Pendentes'}
            </CardTitle>
            <CardDescription>
              {items.length} {isResolutionModeration ? 'resoluções' : 'itens'} aguardando moderação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Carregando...</p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum {isResolutionModeration ? 'resolução' : 'item'} para moderar. Bom trabalho! ✨
              </p>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                    <div className="flex-grow">
                      <p className="font-semibold">
                        {item.title || `Comentário: "${item.text}"`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {getItemDescription(item)}
                      </p>
                      {isResolutionModeration && item.protocol && (
                        <p className="text-sm text-muted-foreground">
                          Protocolo: {item.protocol}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      {(isReportModeration || isResolutionModeration) && (
                        <Button variant="outline" size="icon" onClick={() => handleViewReport(item.id)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-green-500 hover:text-green-600" 
                        onClick={() => handleAction(item, 'approved')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-red-500 hover:text-red-600" 
                        onClick={() => handleAction(item, 'rejected')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
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
          onUpdate={handleUpdateOnModeration}
          onUpvote={handleUpvote}
          onLink={() => {}}
          onFavoriteToggle={() => {}}
          isModerationView={true}
          isResolutionModeration={isResolutionModeration}
          onResolutionAction={handleAction}
        />
      )}
    </>
  );
};

export default ModerationPage;