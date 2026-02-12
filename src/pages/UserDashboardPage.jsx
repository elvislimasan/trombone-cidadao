import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Edit, Trash2, Eye, MessageSquare, FileText, Clock, CheckCircle, XCircle, PlusCircle, Send, Upload, Building, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportDetails from '@/components/ReportDetails';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/customSupabaseClient';

const UserDashboardPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [newEntry, setNewEntry] = useState({ name: '', address: '', phone: '', type: 'commerce', photo: null, photoPreview: null });
  const photoInputRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const fetchUserContributions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: reportsData, error: reportsError } = await supabase
      .from('reports')
      .select('*, pole_number, category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), report_media(*), upvotes:upvotes(count), timeline:report_timeline(*)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });
    
    if (reportsError) {
      toast({ title: "Erro ao buscar suas broncas", description: reportsError.message, variant: "destructive" });
    } else {
      const formattedReports = reportsData.map(r => ({
        ...r,
        location: r.location ? { lat: r.location.coordinates[1], lng: r.location.coordinates[0] } : null,
        category: r.category_id,
        categoryName: r.category?.name,
        categoryIcon: r.category?.icon,
        authorName: r.author?.name || 'Anônimo',
        upvotes: r.upvotes[0]?.count || 0,
        comments: (r.comments || []).filter(c => c.moderation_status === 'approved'),
        photos: (r.report_media || []).filter(m => m.type === 'photo'),
        videos: (r.report_media || []).filter(m => m.type === 'video'),
      }));
      setReports(formattedReports);
    }

    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*, report:reports(title)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (commentsError) toast({ title: "Erro ao buscar seus comentários", description: commentsError.message, variant: "destructive" });
    else setComments(commentsData.map(c => ({...c, reportTitle: c.report?.title})));

    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchUserContributions();
  }, [fetchUserContributions]);

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
    
    toast({ title: "Bronca atualizada com sucesso!" });
    fetchUserContributions();
    if (selectedReport) setSelectedReport(null);
  };

  const handleDeleteReport = async () => {
    if (!reportToDelete) return;
    
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportToDelete.id);

    if (error) {
      toast({ title: "Erro ao remover bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca Removida!", description: "Sua solicitação foi removida com sucesso.", variant: "destructive" });
      fetchUserContributions();
    }
    setReportToDelete(null);
  };

  const openDeleteConfirmation = (report) => {
    setReportToDelete(report);
  };

  const handleNewEntryChange = (e) => {
    const { name, value } = e.target;
    setNewEntry(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewEntry(prev => ({ ...prev, photo: file, photoPreview: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNewEntrySubmit = async (e) => {
    e.preventDefault();
    if (!newEntry.name || !newEntry.address || !newEntry.phone) {
      toast({ title: "Campos obrigatórios", description: "Por favor, preencha nome, endereço e telefone.", variant: "destructive" });
      return;
    }
    
    const { error } = await supabase
      .from('directory')
      .insert({
        name: newEntry.name,
        address: newEntry.address,
        phone: newEntry.phone,
        type: newEntry.type,
        submitted_by: user.id,
        status: 'pending'
      });

    if (error) {
      toast({ title: "Erro ao enviar colaboração", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Colaboração enviada!", description: "Obrigado! Sua sugestão foi enviada para moderação." });
      setNewEntry({ name: '', address: '', phone: '', type: 'commerce', photo: null, photoPreview: null });
    }
  };

    const handleUpvote = async (id) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login');
      return;
    }
    
    const result = await handleUpvoteHook(id);

    if (result.success) {
      fetchUserContributions();
      toast({ title: result.action === 'added' ? "Apoio registrado! 👍" : "Apoio removido." });
    } else {
      toast({ title: "Erro ao apoiar", description: result.error, variant: "destructive" });
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending_approval': return { text: 'Aguardando Moderação', icon: <Clock className="w-4 h-4 text-yellow-500" />, color: 'text-yellow-500' };
      case 'approved': return { text: 'Aprovado', icon: <CheckCircle className="w-4 h-4 text-green-500" />, color: 'text-green-500' };
      case 'rejected': return { text: 'Rejeitado', icon: <XCircle className="w-4 h-4 text-red-500" />, color: 'text-red-500' };
      default: return { text: 'Pendente', icon: <Clock className="w-4 h-4 text-gray-500" />, color: 'text-gray-500' };
    }
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  return (
    <>
      <Helmet>
        <title>Meu Painel - Trombone Cidadão</title>
        <meta name="description" content="Gerencie suas broncas e comentários." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-tc-red">Meu Painel</h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">Acompanhe e gerencie suas contribuições na plataforma.</p>
        </motion.div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 rounded-lg p-1 gap-1 h-auto">
            <TabsTrigger 
              value="reports" 
              className="gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 text-xs sm:text-sm flex items-center justify-center min-w-0 w-full"
            >
              <FileText className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" /> 
              <span className="truncate ml-0.5 sm:ml-0">Broncas</span>
            </TabsTrigger>
            <TabsTrigger 
              value="comments" 
              className="gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 text-xs sm:text-sm flex items-center justify-center min-w-0 w-full"
            >
              <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" /> 
              <span className="truncate ml-0.5 sm:ml-0">Comentários</span>
            </TabsTrigger>
            <TabsTrigger 
              value="guide" 
              className="gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 text-xs sm:text-sm flex items-center justify-center min-w-0 w-full"
            >
              <PlusCircle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" /> 
              <span className="truncate ml-0.5 sm:ml-0">Guias</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="reports" className="mt-8 relative min-h-[300px]">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg font-semibold">Carregando suas broncas...</p>
                  </div>
                </motion.div>
              ) : reports.length > 0 ? (
                <motion.div key="reports-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
                  {reports.map((report) => (
                    <motion.div key={report.id} variants={itemVariants}>
                      <Card className="h-full flex flex-col bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
                          <CardTitle className="text-lg md:text-xl font-bold text-foreground line-clamp-1">{report.title}</CardTitle>
                          <div className="flex items-center gap-2 text-xs md:text-sm">
                            {getStatusInfo(report.moderation_status).icon}
                            <span className={getStatusInfo(report.moderation_status).color}>{getStatusInfo(report.moderation_status).text}</span>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-grow p-4 md:p-6 pt-0 md:pt-0">
                          <p className="text-muted-foreground text-xs md:text-sm line-clamp-3">{report.description}</p>
                        </CardContent>
                        <CardFooter className="p-3 md:p-4 bg-muted/50 flex justify-between items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedReport(report)} className="gap-1 md:gap-2 h-8 md:h-10 text-xs md:text-sm px-2 md:px-4"><Eye className="w-3 h-3 md:w-4 md:h-4" /> Detalhes</Button>
                          <div className="flex gap-1 md:gap-2">
                            <Button size="icon" variant="outline" className="h-8 w-8 md:h-10 md:w-10" onClick={() => setSelectedReport(report)} disabled={report.moderation_status !== 'pending_approval'}><Edit className="w-3 h-3 md:w-4 md:h-4" /></Button>
                            <Button size="icon" variant="destructive" className="h-8 w-8 md:h-10 md:w-10" onClick={() => openDeleteConfirmation(report)}><Trash2 className="w-3 h-3 md:w-4 md:h-4" /></Button>
                          </div>
                        </CardFooter>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div key="no-reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16 bg-card rounded-lg border border-border">
                  <p className="text-2xl font-bold text-muted-foreground">Nenhuma bronca registrada.</p>
                  <p className="text-muted-foreground mt-2">Que tal começar agora e fazer a diferença na sua cidade?</p>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="comments" className="mt-8">
            {comments.length > 0 ? (
              <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
                {comments.map((comment) => (
                  <motion.div key={comment.id} variants={itemVariants}>
                    <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg">
                      <CardContent className="p-4 md:p-6">
                        <p className="text-muted-foreground text-xs md:text-sm italic">"{comment.text}"</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground mt-2">Em {new Date(comment.created_at).toLocaleDateString('pt-BR')} na bronca: <span className="font-semibold text-foreground">{comment.reportTitle || 'Bronca removida'}</span></p>
                      </CardContent>
                      <CardFooter className="p-3 md:p-4 bg-muted/50 flex justify-end items-center gap-2">
                        <div className="flex items-center gap-2 text-[10px] md:text-sm">
                          {getStatusInfo(comment.moderation_status).icon}
                          <span className={getStatusInfo(comment.moderation_status).color}>{getStatusInfo(comment.moderation_status).text}</span>
                        </div>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card rounded-lg border border-border">
                <p className="text-2xl font-bold text-muted-foreground">Você ainda não comentou.</p>
                <p className="text-muted-foreground mt-2">Sua opinião é importante! Participe das discussões.</p>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="guide" className="mt-8">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Adicionar ao Guia Comercial</CardTitle>
                <CardDescription>Ajude a mapear os serviços e comércios da nossa cidade. Sua colaboração é muito importante!</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleNewEntrySubmit} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome do Estabelecimento</Label>
                    <Input id="name" name="name" value={newEntry.name} onChange={handleNewEntryChange} placeholder="Ex: Supermercado Central" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input id="address" name="address" value={newEntry.address} onChange={handleNewEntryChange} placeholder="Ex: Rua Principal, 123" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" name="phone" value={newEntry.phone} onChange={handleNewEntryChange} placeholder="(87) 99999-8888" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Tipo</Label>
                    <Select value={newEntry.type} onValueChange={(value) => setNewEntry(prev => ({ ...prev, type: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commerce"><div className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Comércio Local</div></SelectItem>
                        <SelectItem value="public"><div className="flex items-center gap-2"><Building className="w-4 h-4" /> Serviço Público</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Foto do Local (Opcional)</Label>
                    <div className="flex items-center gap-4">
                      {newEntry.photoPreview ? (
                        <img src={newEntry.photoPreview} alt="Pré-visualização" className="w-24 h-24 object-cover rounded-md border" />
                      ) : (
                        <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                          <Building className="w-8 h-8" />
                        </div>
                      )}
                      <Button type="button" variant="outline" onClick={() => photoInputRef.current.click()}><Upload className="w-4 h-4 mr-2" />Enviar Foto</Button>
                      <input type="file" ref={photoInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full gap-2"><Send className="w-4 h-4" /> Enviar para Moderação</Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {selectedReport && <ReportDetails report={selectedReport} onClose={() => setSelectedReport(null)} onUpdate={handleUpdateReport} onUpvote={handleUpvote} onLink={() => {}} />}
      
      <Dialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover a bronca "{reportToDelete?.title}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteReport}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserDashboardPage;