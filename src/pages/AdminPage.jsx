import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Check, X, Eye, MessageSquare, FileText, Settings, Edit, Newspaper, Briefcase, Construction, Route as RoadIcon, Palette, Users, Filter, Search, EyeOff, Trash2, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ReportDetails from '@/components/ReportDetails';
import LinkReportModal from '@/components/LinkReportModal';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useUpvote } from '../hooks/useUpvotes';

const AdminPage = () => {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [filters, setFilters] = useState({ search: '', moderationStatus: 'all', category: 'all' });
  const { toast } = useToast();
  const navigate = useNavigate();
  const { handleUpvote, loading } = useUpvote();

  useEffect(() => {
    const savedReports = localStorage.getItem('trombone-reports');
    if (savedReports) {
      setReports(JSON.parse(savedReports));
    }
  }, []);

  const updateReports = (updatedReports) => {
    setReports(updatedReports);
    localStorage.setItem('trombone-reports', JSON.stringify(updatedReports));
  };

  const filteredAndSortedReports = useMemo(() => {
    return reports
      .filter(report => {
        const searchMatch = filters.search === '' || report.title.toLowerCase().includes(filters.search.toLowerCase());
        const moderationMatch = filters.moderationStatus === 'all' || report.moderationStatus === filters.moderationStatus;
        const categoryMatch = filters.category === 'all' || report.category === filters.category;
        return searchMatch && moderationMatch && categoryMatch;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [reports, filters]);

  const pendingComments = useMemo(() => {
    return reports.flatMap(report => 
      (report.comments || [])
        .filter(comment => comment.moderationStatus === 'pending_approval')
        .map(comment => ({ ...comment, reportId: report.id, reportTitle: report.title }))
    );
  }, [reports]);

  const handleReportModeration = (reportId, newStatus) => {
    const updatedReports = reports.map(r => {
      if (r.id === reportId) {
        const timelineUpdate = {
          status: 'pending',
          date: new Date().toISOString(),
          description: newStatus === 'approved' ? 'Solicitação aprovada pela moderação.' : 'Solicitação rejeitada pela moderação.'
        };
        return { ...r, moderationStatus: newStatus, timeline: [...(r.timeline || []), timelineUpdate] };
      }
      return r;
    });
    updateReports(updatedReports);
    toast({
      title: `Bronca ${newStatus === 'approved' ? 'Aprovada' : 'Rejeitada'}!`,
      description: `A solicitação foi movida para a seção correspondente.`,
    });
  };

  const handleToggleVisibility = (reportId) => {
    const updatedReports = reports.map(r => {
      if (r.id === reportId) {
        const newStatus = r.moderationStatus === 'hidden' ? 'approved' : 'hidden';
        return { ...r, moderationStatus: newStatus };
      }
      return r;
    });
    updateReports(updatedReports);
    toast({
      title: `Visibilidade alterada!`,
      description: `A bronca agora está ${reports.find(r => r.id === reportId)?.moderationStatus === 'hidden' ? 'visível' : 'oculta'}.`,
    });
  };

  const handleDeleteReport = (reportId) => {
    const updatedReports = reports.filter(r => r.id !== reportId);
    updateReports(updatedReports);
    setReportToDelete(null);
    toast({
      title: "Bronca removida!",
      description: "A solicitação foi excluída permanentemente.",
      variant: "destructive"
    });
  };

  const handleCommentModeration = (reportId, commentId, newStatus) => {
    const updatedReports = reports.map(report => {
      if (report.id === reportId) {
        const updatedComments = report.comments.map(comment => {
          if (comment.id === commentId) {
            return { ...comment, moderationStatus: newStatus };
          }
          return comment;
        });
        return { ...report, comments: updatedComments };
      }
      return report;
    });
    updateReports(updatedReports);
    toast({
      title: `Comentário ${newStatus === 'approved' ? 'Aprovado' : 'Rejeitado'}!`,
      description: `O comentário foi ${newStatus === 'approved' ? 'publicado' : 'removido'}.`,
    });
  };

  const handleUpdateReport = (updatedReport) => {
    const updatedReports = reports.map(report => report.id === updatedReport.id ? updatedReport : report);
    updateReports(updatedReports);
    if (selectedReport && selectedReport.id === updatedReport.id) {
      setSelectedReport(updatedReport);
    }
  };

  const handleOpenLinkModal = (report) => {
    setReportToLink(report);
    setShowLinkModal(true);
    setSelectedReport(null);
  };

  const handleLinkReport = (sourceReportId, targetReportId) => {
    const updatedReports = reports.map(r => {
      if (r.id === sourceReportId) {
        return { ...r, status: 'duplicate', linkedTo: targetReportId };
      }
      return r;
    });
    updateReports(updatedReports);
    toast({ title: "Bronca vinculada! 🔗", description: "A solicitação foi marcada como duplicada." });
    setShowLinkModal(false);
    setReportToLink(null);
  };

  const handleManageContent = (path) => {
    navigate(path);
  };

  const getModerationStatusChip = (status) => {
    switch (status) {
      case 'approved': return <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">Aprovada</span>;
      case 'pending_approval': return <span className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full">Pendente</span>;
      case 'rejected': return <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">Rejeitada</span>;
      case 'hidden': return <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-full">Oculta</span>;
      default: return null;
    }
  };


  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <>
      <Helmet>
        <title>Admin - Painel de Controle</title>
        <meta name="description" content="Página de administração para moderar conteúdo e gerenciar o site." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-tc-red">
            Painel de Controle
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Gerencie o conteúdo da plataforma, aprove broncas e modere comentários.
          </p>
        </motion.div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 bg-muted/50 rounded-lg h-auto sm:h-10">
            <TabsTrigger value="reports" className="gap-2"><FileText className="w-4 h-4" /> Gerenciar Broncas</TabsTrigger>
            <TabsTrigger value="comments" className="gap-2"><MessageSquare className="w-4 h-4" /> Moderar Comentários</TabsTrigger>
            <TabsTrigger value="content" className="gap-2"><Settings className="w-4 h-4" /> Gerenciar Site</TabsTrigger>
          </TabsList>
          
          <TabsContent value="reports" className="mt-8">
            <Card className="mb-8">
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input placeholder="Pesquisar por título..." className="pl-10" value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between">Status: {filters.moderationStatus === 'all' ? 'Todos' : filters.moderationStatus}<Filter className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup value={filters.moderationStatus} onValueChange={(v) => setFilters(f => ({ ...f, moderationStatus: v }))}>
                      <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="pending_approval">Pendente</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="approved">Aprovada</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="rejected">Rejeitada</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="hidden">Oculta</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" className="w-full justify-between">Categoria: {filters.category === 'all' ? 'Todas' : filters.category}<Filter className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup value={filters.category} onValueChange={(v) => setFilters(f => ({ ...f, category: v }))}>
                      <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="buracos">Buracos</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="iluminacao">Iluminação</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="esgoto">Esgoto</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="limpeza">Limpeza</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="poda">Poda de Árvore</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>

            {filteredAndSortedReports.length > 0 ? (
              <div className="space-y-4">
                {filteredAndSortedReports.map((report) => (
                  <Card key={report.id} className="bg-card border-border rounded-lg overflow-hidden">
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getModerationStatusChip(report.moderationStatus)}
                          <h3 className="font-semibold text-foreground truncate">{report.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Enviado em: {new Date(report.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedReport(report)}><Edit className="w-4 h-4 mr-2" />Editar/Ver</Button>
                        {report.moderationStatus === 'pending_approval' && (
                          <>
                            <Button size="sm" variant="outline" className="text-red-500 border-red-500 hover:bg-red-500/10" onClick={() => handleReportModeration(report.id, 'rejected')}><X className="w-4 h-4 mr-2" />Rejeitar</Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleReportModeration(report.id, 'approved')}><Check className="w-4 h-4 mr-2" />Aprovar</Button>
                          </>
                        )}
                        {report.moderationStatus === 'approved' && <Button variant="outline" size="sm" onClick={() => handleToggleVisibility(report.id)}><EyeOff className="w-4 h-4 mr-2" />Ocultar</Button>}
                        {report.moderationStatus === 'hidden' && <Button variant="outline" size="sm" onClick={() => handleToggleVisibility(report.id)}><Eye className="w-4 h-4 mr-2" />Mostrar</Button>}
                        <Button variant="destructive" size="sm" onClick={() => setReportToDelete(report)}><Trash2 className="w-4 h-4 mr-2" />Remover</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card rounded-lg border border-border">
                <p className="text-xl font-bold text-muted-foreground">Nenhuma bronca encontrada</p>
                <p className="text-muted-foreground mt-2">Tente ajustar os filtros ou aguarde novas solicitações.</p>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="comments" className="mt-8">
            {pendingComments.length > 0 ? (
              <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
                {pendingComments.map((comment) => (
                  <motion.div key={comment.id} variants={itemVariants}>
                    <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
                      <CardContent className="p-6">
                        <p className="text-muted-foreground text-sm italic">"{comment.text}"</p>
                        <p className="text-xs text-muted-foreground mt-2">Por: {comment.author} em {new Date(comment.createdAt).toLocaleDateString('pt-BR')}</p>
                        <p className="text-xs text-muted-foreground mt-1">Na bronca: <span className="font-semibold text-foreground">{comment.reportTitle}</span></p>
                      </CardContent>
                      <CardFooter className="p-4 bg-muted/50 flex justify-end items-center gap-2">
                        <Button size="sm" variant="outline" className="text-red-500 border-red-500 hover:bg-red-500/10" onClick={() => handleCommentModeration(comment.reportId, comment.id, 'rejected')}><X className="w-4 h-4 mr-2" /> Rejeitar</Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleCommentModeration(comment.reportId, comment.id, 'approved')}><Check className="w-4 h-4 mr-2" /> Aprovar</Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card rounded-lg border border-border">
                <p className="text-2xl font-bold text-green-500">Caixa de entrada limpa!</p>
                <p className="text-muted-foreground mt-2">Não há nenhum comentário pendente de moderação.</p>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="content" className="mt-8">
            <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" variants={containerVariants} initial="hidden" animate="visible">
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><Users /> Usuários</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Gerencie os usuários cadastrados na plataforma.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/usuarios')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><Shapes /> Categorias de Broncas</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Crie, edite e remova as categorias de problemas.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/categorias')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><Briefcase /> Guia de Serviços</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Edite informações sobre transportes, pontos turísticos e CEPs.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/servicos')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><Newspaper /> Notícias</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Adicione, edite ou remova notícias e comunicados da prefeitura.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/noticias')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><Construction /> Obras Públicas</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Atualize o status, valores e informações das obras em andamento.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/obras')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><RoadIcon /> Mapa de Pavimentação</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Gerencie as ruas e o status de pavimentação no mapa interativo.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/pavimentacao')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
              <motion.div variants={itemVariants}>
                <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 text-center h-full flex flex-col">
                  <CardHeader><CardTitle className="flex items-center justify-center gap-2"><Palette /> Configurações do Site</CardTitle></CardHeader>
                  <CardContent className="flex-grow"><CardDescription>Personalize a aparência do site, como a logo e as cores.</CardDescription></CardContent>
                  <CardFooter className="p-4 bg-muted/50"><Button className="w-full gap-2" onClick={() => handleManageContent('/admin/configuracoes')}><Edit className="w-4 h-4" /> Gerenciar</Button></CardFooter>
                </Card>
              </motion.div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
      {selectedReport && <ReportDetails report={selectedReport} onClose={() => setSelectedReport(null)} onUpdate={handleUpdateReport} onUpvote={() => handleUpvote(selectedReport.id, selectedReport.upvotes, selectedReport.user_has_upvoted)} onLink={handleOpenLinkModal} />}
      {showLinkModal && reportToLink && (
        <LinkReportModal
          sourceReport={reportToLink}
          allReports={reports}
          onClose={() => setShowLinkModal(false)}
          onLink={handleLinkReport}
        />
      )}
      <Dialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a bronca "{reportToDelete?.title}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteReport(reportToDelete.id)}>
              <Trash2 className="w-4 h-4 mr-2" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminPage;