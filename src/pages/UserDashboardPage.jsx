import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Edit, Trash2, Eye, MessageSquare, FileText, Clock, CheckCircle, XCircle, PlusCircle, Send, Upload, Building, ShoppingCart, MapPin, Share2, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportDetails from '@/components/ReportDetails';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import ReportModal from '@/components/ReportModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUpvote } from '../hooks/useUpvotes';

const UserDashboardPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({ name: '', address: '', phone: '', type: 'commerce', photo: null, photoPreview: null });
  const photoInputRef = useRef(null);
  const suppressReportAutoOpenRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('reports');
  const navigate = useNavigate();

  const reportParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('report');
    } catch {
      return null;
    }
  }, [location.search]);

  const tabParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('tab');
    } catch {
      return null;
    }
  }, [location.search]);
  const { handleUpvote: handleUpvoteHook } = useUpvote();

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

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    } else if (reportParam) {
      setActiveTab('reports');
    }
  }, [tabParam, reportParam]);

  useEffect(() => {
    if (!reportParam) {
      suppressReportAutoOpenRef.current = false;
    }
  }, [reportParam]);

  useEffect(() => {
    if (suppressReportAutoOpenRef.current) return;
    if (!reportParam || reports.length === 0) return;
    const found = reports.find(r => String(r.id) === String(reportParam));
    if (!found) return;
    if (selectedReport?.id === found.id) return;
    
    // 🔥 Fechar menu de notificações quando ReportDetails for aberto
    window.dispatchEvent(new CustomEvent('close-notifications-popover'));
    
    setSelectedReport(found);
  }, [reportParam, reports, selectedReport?.id]);

  const handleCloseReportDetails = useCallback(() => {
    suppressReportAutoOpenRef.current = true;
    setSelectedReport(null);

    const params = new URLSearchParams(location.search);
    params.delete('report');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

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
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
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
    
    toast({ title: "Bronca atualizada com sucesso!" });
    fetchUserContributions();
    if (reportParam) handleCloseReportDetails();
    else if (selectedReport) setSelectedReport(null);
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

  const handleCreateReport = async (newReportData, uploadMediaCallback) => {
    if (!user) return;

    const { title, description, category, address, location, pole_number, pole_id, reported_pole_distance_m, issue_type, reported_post_identifier, reported_plate, is_from_water_utility } = newReportData;
    const normalizePoleLabel = (raw) => String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();
    const normalizedPole = normalizePoleLabel(pole_number);
    const savedReportedPostIdentifier = reported_post_identifier ? normalizePoleLabel(reported_post_identifier) : (normalizedPole || null);
    const savedReportedPlate = reported_plate ? normalizePoleLabel(reported_plate) : (normalizedPole || null);

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
        pole_id: category === 'iluminacao' ? pole_id : null,
        reported_post_identifier: category === 'iluminacao' ? savedReportedPostIdentifier : null,
        reported_plate: category === 'iluminacao' ? savedReportedPlate : null,
        reported_pole_distance_m: category === 'iluminacao' ? reported_pole_distance_m : null,
        issue_type: category === 'iluminacao' ? (issue_type?.trim() || null) : null,
        is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
        status: 'pending',
        moderation_status: user?.is_admin ? 'approved' : 'pending_approval',
      })
      .select('id, title')
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
    setIsReportModalOpen(false);

    // Atualiza a lista de broncas do usuário
    setTimeout(() => {
      fetchUserContributions();
    }, 1000);
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
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10 space-y-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-tc-red">Meu Painel</h1>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">Acompanhe e gerencie suas contribuições na plataforma.</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button
              className="h-10 px-4 sm:px-6 rounded-full font-semibold bg-tc-red hover:bg-tc-red/90"
              onClick={() => setIsReportModalOpen(true)}
            >
              Cadastrar minha primeira bronca
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 px-4 sm:px-6 rounded-full font-semibold border-[#F97316] text-[#F97316] hover:bg-[#FEF2F2]"
            >
              <a href="/minhas-peticoes">Criar um abaixo-assinado</a>
            </Button>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                <motion.div key="reports-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
                  {reports.map((report) => (
                    <motion.div key={report.id} variants={itemVariants}>
                      <div
                        className="h-full flex flex-col bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden hover:shadow-lg transition cursor-pointer group"
                        onClick={() => setSelectedReport(report)}
                      >
                        <div className="relative h-40 w-full overflow-hidden">
                          {report.photos && report.photos.length > 0 ? (
                            <img
                              src={report.photos[0].url}
                              alt={report.title}
                              className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#0EA5E9] flex items-center justify-center">
                              <span className="text-4xl">{report.categoryIcon || '📍'}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                          
                          <div className="absolute top-2 left-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                              report.moderation_status === 'approved' ? 'bg-green-100 text-green-700' :
                              report.moderation_status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {getStatusInfo(report.moderation_status).icon}
                              {getStatusInfo(report.moderation_status).text}
                            </span>
                          </div>

                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                             <div className="flex items-center gap-2">
                                <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                                  <Eye className="w-3.5 h-3.5" />
                                  {report.views || 0}
                                </span>
                                <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                                  <Heart className="w-3.5 h-3.5" />
                                  {report.upvotes || 0}
                                </span>
                             </div>
                             
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Button 
                                  size="icon" 
                                  variant="secondary" 
                                  className="h-7 w-7 rounded-full bg-white/95 text-[#374151] hover:bg-white hover:text-blue-600" 
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedReport(report);
                                  }}
                                  disabled={report.moderation_status !== 'pending_approval'}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="secondary"
                                  className="h-7 w-7 rounded-full bg-white/95 text-[#374151] hover:bg-red-50 hover:text-red-600"
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteConfirmation(report);
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 flex-grow flex flex-col space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                             <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate max-w-[150px]">{report.address || 'Endereço não informado'}</span>
                             </div>
                             <span className="text-[10px]">{new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>

                          <h3 className="text-base font-semibold text-[#111827] leading-snug line-clamp-2">
                            {report.title}
                          </h3>
                          
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {report.description}
                          </p>

                          <div className="pt-2 mt-auto flex items-center justify-between gap-2 border-t border-gray-100">
                             <div className="flex items-center gap-1.5">
                                <span className="text-lg">{report.categoryIcon}</span>
                                <span className="text-xs font-medium text-gray-600">{report.categoryName}</span>
                             </div>
                             {report.is_featured && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">
                                  Destaque
                                </span>
                             )}
                          </div>
                        </div>
                      </div>
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
                    <Combobox
                      options={[
                        { value: 'commerce', label: 'Comércio Local' },
                        { value: 'public', label: 'Serviço Público' }
                      ]}
                      value={newEntry.type}
                      onChange={(value) => setNewEntry(prev => ({ ...prev, type: value }))}
                      placeholder="Selecione o tipo"
                      searchPlaceholder="Buscar tipo..."
                      notFoundText="Tipo não encontrado"
                    />
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
      {selectedReport && <ReportDetails report={selectedReport} onClose={handleCloseReportDetails} onUpdate={handleUpdateReport} onUpvote={handleUpvote} onLink={() => {}} />}
      
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
      
      {isReportModalOpen && (
        <ReportModal
          onClose={() => setIsReportModalOpen(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </>
  );
};

export default UserDashboardPage;
