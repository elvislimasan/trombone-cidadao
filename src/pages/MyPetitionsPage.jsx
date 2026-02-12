import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Clock, CheckCircle, XCircle, FileText, ExternalLink, Edit, Eye, Trash2, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { exportPetitionPDF } from '@/utils/pdfExport';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MyPetitionsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [petitions, setPetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedRejectionReason, setSelectedRejectionReason] = useState(null);
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);

  // Filter and Pagination states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchPetitions = async () => {
      try {
        const { data, error } = await supabase
          .from('petitions')
          .select('*, signatures:signatures(count)')
          .eq('author_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const formattedData = (data || []).map(p => ({
          ...p,
          signatureCount: p.signatures?.[0]?.count || 0
        }));
        
        setPetitions(formattedData);
      } catch (error) {
        console.error('Error fetching petitions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPetitions();
  }, [user, navigate]);

  const getStatusInfo = (status) => {
    switch (status) {
      case 'open':
        return { label: 'Aprovada / Aberta', color: 'bg-green-100 text-green-800', icon: CheckCircle };
      case 'victory':
        return { label: 'Vitória', color: 'bg-blue-100 text-blue-800', icon: CheckCircle };
      case 'rejected':
        return { label: 'Rejeitada', color: 'bg-red-100 text-red-800', icon: XCircle };
      case 'closed':
        return { label: 'Encerrada', color: 'bg-gray-100 text-gray-800', icon: Clock };
      case 'draft':
        return { label: 'Rascunho', color: 'bg-slate-100 text-slate-800', icon: FileText };
      case 'pending_moderation':
        return { label: 'Em Análise', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
      default:
        return { label: 'Status Desconhecido', color: 'bg-gray-100 text-gray-800', icon: Clock };
    }
  };

  const filteredPetitions = petitions.filter(petition => {
    const matchesSearch = (petition.title || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || petition.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredPetitions.length / itemsPerPage);
  const currentPetitions = filteredPetitions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDeletePetition = async (petition) => {
    if (!confirm("Tem certeza que deseja excluir permanentemente esta petição? Esta ação não pode ser desfeita.")) return;

    setLoading(true);
    try {
      // 1. Se estiver vinculada a uma bronca, atualizar a flag is_petition na tabela reports
      if (petition.report_id) {
        await supabase
          .from('reports')
          .update({ is_petition: false })
          .eq('id', petition.report_id);
      }

      // 2. Excluir a petição
      const { error } = await supabase
        .from('petitions')
        .delete()
        .eq('id', petition.id);

      if (error) throw error;

      // 3. Remover rascunho local se existir
      localStorage.removeItem(`petition_editor_draft_${petition.id}`);

      toast({ 
        title: "Petição excluída", 
        description: "O abaixo-assinado foi removido permanentemente." 
      });

      // 4. Atualizar o estado local
      setPetitions(prev => prev.filter(p => p.id !== petition.id));
      
    } catch (error) {
      console.error('Error deleting petition:', error);
      toast({ 
        title: "Erro ao excluir", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePetition = async () => {
    if (!user) {
      toast({ title: "Login necessário", description: "Você precisa estar logado para criar um abaixo-assinado.", variant: "destructive" });
      navigate('/login');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('petitions')
        .insert({
          title: '',
          description: '',
          target: '',
          author_id: user.id,
          status: 'draft',
          goal: 100
        })
        .select()
        .single();

      if (error) throw error;

      navigate(`/abaixo-assinado/${data.id}?edit=true`);
    } catch (error) {
      console.error('Error creating draft:', error);
      toast({ title: "Erro ao criar", description: "Não foi possível iniciar o abaixo-assinado.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 className="text-3xl font-bold mb-2">Minhas Petições</h1>
            <p className="text-muted-foreground">Acompanhe o status e o progresso dos seus abaixo-assinados.</p>
        </div>
        <Button onClick={handleCreatePetition} disabled={creating} className="shrink-0">
            {creating ? 'Iniciando...' : 'Criar Abaixo-Assinado'}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-grow">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Pesquisar suas petições..."
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                }}
                className="pl-9"
            />
        </div>
        <div className="w-full md:w-48 shrink-0">
            <Select 
                value={filterStatus} 
                onValueChange={(value) => {
                    setFilterStatus(value);
                    setCurrentPage(1);
                }}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="open">Aprovadas / Abertas</SelectItem>
                    <SelectItem value="pending_moderation">Em Análise</SelectItem>
                    <SelectItem value="rejected">Rejeitadas</SelectItem>
                    <SelectItem value="draft">Rascunhos</SelectItem>
                    <SelectItem value="victory">Vitória</SelectItem>
                    <SelectItem value="closed">Encerradas</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </div>

      {filteredPetitions.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4 opacity-20" />
            <h3 className="text-xl font-medium mb-2">Nenhuma petição encontrada</h3>
            <p className="text-muted-foreground mb-6">
                {searchTerm || filterStatus !== 'all' 
                    ? 'Tente ajustar seus filtros de pesquisa.' 
                    : 'Você ainda não criou nenhum abaixo-assinado.'}
            </p>
            {(searchTerm || filterStatus !== 'all') && (
                <Button variant="outline" onClick={() => {setSearchTerm(''); setFilterStatus('all');}}>
                    Limpar Filtros
                </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentPetitions.map((petition) => {
                const statusInfo = getStatusInfo(petition.status);
                const StatusIcon = statusInfo.icon;

                return (
                <motion.div
                    key={petition.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex"
                >
                    <Card className="overflow-hidden flex flex-col w-full hover:shadow-md transition-shadow duration-300">
                    <div className={`h-1.5 w-full ${petition.status === 'rejected' ? 'bg-red-500' : petition.status === 'open' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start gap-2 mb-2">
                            <Badge variant="outline" className={`${statusInfo.color} border-0 font-medium px-2 py-0.5`}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusInfo.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(petition.created_at), "dd/MM/yyyy")}
                            </span>
                        </div>
                        <CardTitle className="text-lg leading-tight line-clamp-2 min-h-[3rem]">
                            {['open', 'victory', 'closed'].includes(petition.status) ? (
                                <Link to={`/abaixo-assinado/${petition.id}`} className="hover:underline">
                                    {petition.title || 'Sem título'}
                                </Link>
                            ) : (
                                <Link to={`/abaixo-assinado/${petition.id}?edit=true`} className="hover:underline">
                                    {petition.title || 'Sem título'}
                                </Link>
                            )}
                        </CardTitle>
                    </CardHeader>
                    
                    <CardContent className="flex-grow pb-3">
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4 min-h-[4.5rem]">
                            {petition.description || 'Sem descrição.'}
                        </p>

                        {petition.status === 'rejected' && petition.rejection_reason && (
                            <Alert variant="destructive" className="py-2 px-3 text-xs mb-3 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
                                <AlertTriangle className="h-3 w-3" />
                                <div className="flex flex-col gap-1 w-full">
                                    <AlertTitle className="text-xs font-bold mb-0 ml-1">Reprovado:</AlertTitle>
                                    <AlertDescription className="mt-1 ml-1 text-xs line-clamp-2">
                                        {petition.rejection_reason}
                                    </AlertDescription>
                                    <Button 
                                        variant="link" 
                                        size="sm" 
                                        className="h-auto p-0 text-[10px] text-red-600 dark:text-red-400 font-bold self-start mt-1 hover:no-underline"
                                        onClick={() => {
                                            setSelectedRejectionReason(petition.rejection_reason);
                                            setIsReasonModalOpen(true);
                                        }}
                                    >
                                        <Eye className="w-3 h-3 mr-1" />
                                        Ver motivo completo
                                    </Button>
                                </div>
                            </Alert>
                        )}
                        
                        <div className="flex items-center text-sm font-medium text-muted-foreground bg-muted/30 p-2 rounded-md">
                            <FileText className="w-4 h-4 mr-2 text-primary" />
                            <span className="text-foreground">{0}</span> 
                            <span className="mx-1">/</span>
                            <span>{petition.goal} assinaturas</span>
                        </div>
                    </CardContent>

                    <CardFooter className="pt-3 border-t bg-muted/10 gap-2">
                        {petition.status === 'pending_moderation' ? (
                            <div className="flex gap-2 w-full">
                                <Button variant="secondary" size="sm" className="flex-1 opacity-80 cursor-not-allowed" disabled>
                                    <Clock className="w-4 h-4 mr-2" />
                                    Em Análise
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="px-2 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeletePetition(petition)}
                                    title="Excluir"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ) : (
                            <>
                                {(petition.status === 'rejected' || petition.status === 'draft') ? (
                                    <Button variant="default" size="sm" className="flex-1" onClick={() => navigate(`/abaixo-assinado/${petition.id}?edit=true`)}>
                                        <Edit className="w-4 h-4 mr-2" />
                                        Editar
                                    </Button>
                                ) : (
                                    // If approved (open, victory, closed), only admins can manage. 
                                    // Regular users (authors) can only view the page.
                                    user?.is_admin && (
                                        <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/abaixo-assinado/${petition.id}?edit=true`)}>
                                            <Edit className="w-4 h-4 mr-2" />
                                            Gerenciar
                                        </Button>
                                    )
                                )}
                                
                                {['open', 'victory', 'closed'].includes(petition.status) && (
                                    <>
                                        <Button variant={petition.status === 'open' ? "default" : "secondary"} size="sm" className="flex-1" onClick={() => navigate(`/abaixo-assinado/${petition.id}`)}>
                                            Ver Página
                                        </Button>
                                        
                                        {user?.is_admin && (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="px-3" 
                                                onClick={() => exportPetitionPDF(petition, toast)}
                                                title="Baixar PDF das Assinaturas"
                                            >
                                                <FileDown className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </>
                                )}

                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="px-2 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeletePetition(petition)}
                                    title="Excluir"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </CardFooter>
                    </Card>
                </motion.div>
                );
            })}
            </div>

            {/* Pagination Controls */}
            {filteredPetitions.length > itemsPerPage && (
                <div className="flex items-center justify-center gap-2 mt-12">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1 mx-2">
                        <span className="text-sm font-medium">Página {currentPage}</span>
                        <span className="text-sm text-muted-foreground">de {totalPages}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </>
      )}

        <Dialog open={isReasonModalOpen} onOpenChange={setIsReasonModalOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        Motivo da Reprovação
                    </DialogTitle>
                    <DialogDescription>
                        Abaixo estão as observações da moderação sobre o seu abaixo-assinado.
                    </DialogDescription>
                </DialogHeader>
                <div className="bg-muted/50 p-4 rounded-lg border text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedRejectionReason}
                </div>
                <div className="flex justify-end mt-4">
                    <Button onClick={() => setIsReasonModalOpen(false)}>
                        Fechar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
};

export default MyPetitionsPage;
