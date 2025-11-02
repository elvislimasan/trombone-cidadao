import React, { useState, useRef, lazy, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { X, MapPin, Calendar, ThumbsUp, Star, CheckCircle, Clock, AlertTriangle, Flag, Share2, Video, Image as ImageIcon, MessageSquare, Send, Link as LinkIcon, Edit, Save, Trash2, Camera, Hourglass, Shield, Repeat, Check, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import MediaViewer from '@/components/MediaViewer';
import MarkResolvedModal from '@/components/MarkResolvedModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from '@/lib/customSupabaseClient';
import DynamicSEO from './DynamicSeo';


const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const compressImage = (file, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob conversion failed.'));
              return;
            }
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          },
          'image/jpeg',
          quality
        );
      };
    };
    reader.onerror = error => reject(error);
  });
};

const ReportDetails = ({ 
  report, 
  onClose, 
  onUpdate, 
  onUpvote, 
  onLink, 
  onFavoriteToggle, 
  isModerationView = false,
  isResolutionModeration = false,
  onResolutionAction,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [evaluation, setEvaluation] = useState({ rating: 0, comment: '' });
  const [newComment, setNewComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const { toast } = useToast();
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [mediaViewerState, setMediaViewerState] = useState({ isOpen: false, startIndex: 0 });
  const [showMarkResolvedModal, setShowMarkResolvedModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showResolutionImage, setShowResolutionImage] = useState(false);

  const categories = {
    'iluminacao': 'Iluminação Pública',
    'buracos': 'Buracos na Via',
    'esgoto': 'Esgoto Entupido',
    'limpeza': 'Limpeza Urbana',
    'poda': 'Poda de Árvore',
    'vazamento-de-agua': 'Vazamento de Água',
    'outros': 'Outros',
  };

  const getCategoryIcon = (category) => ({ 'iluminacao': '💡', 'buracos': '🕳️', 'esgoto': '🚰', 'limpeza': '🧹', 'poda': '🌳', 'outros': '📍', 'vazamento-de-agua': '💧' }[category] || '📍');
  const getCategoryName = (category) => categories[category] || 'Outros';
  
  const getStatusInfo = (status) => {
    const info = {
      'pending': { icon: AlertTriangle, text: 'Pendente', color: 'text-primary bg-primary/10', description: 'Aguardando análise da prefeitura' },
      'in-progress': { icon: Clock, text: 'Em Andamento', color: 'text-secondary bg-secondary/10', description: 'Equipe trabalhando na resolução' },
      'resolved': { icon: CheckCircle, text: 'Resolvido', color: 'text-green-500 bg-green-500/10', description: 'Problema solucionado' },
      'duplicate': { icon: LinkIcon, text: 'Duplicada', color: 'text-gray-500 bg-gray-500/10', description: 'Esta solicitação é uma duplicata' },
      'pending_resolution': { icon: Hourglass, text: 'Verificando Resolução', color: 'text-blue-500 bg-blue-500/10', description: 'Aguardando aprovação da foto de resolução.' },
      'pending_approval': { icon: Hourglass, text: 'Aguardando Aprovação', color: 'text-yellow-500 bg-yellow-500/10', description: 'Aguardando moderação.' }
    };
    return info[status] || info.pending;
  };

  const formatDate = (dateString) => new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Função para obter a URL da imagem corretamente
  const getReportImage = () => {
    if (!report?.photos || report.photos.length === 0) {
      return null; // Deixa o DynamicSEO usar a defaultImage
    }
    
    const firstPhoto = report.photos[0];

    console.log(firstPhoto);
    
    // Tenta diferentes propriedades que podem conter a URL
    return firstPhoto.url || 
           firstPhoto.publicUrl || 
           firstPhoto.photo_url || 
           firstPhoto.image_url;
  };


  const seoData = {
    title: `${report?.title} - Trombone Cidadão`,
    description: report?.description || `Solicitação de ${getCategoryName(report?.category)} em Floresta-PE. Protocolo: ${report?.protocol}`,
    image: getReportImage(), // Agora usa a função que retorna null se não tiver imagem
    url: `${window.location.origin}/bronca/${report?.id}`,
    type: "article"
  };

  const handleMarkResolvedClick = () => {
    if (!user) {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para marcar uma bronca como resolvida.",
        variant: "destructive",
      });
      navigate('/login');
      return;
    }
    setShowMarkResolvedModal(true);
  };

  const handleConfirmResolution = async (resolutionData) => {
    const { photoFile } = resolutionData;
    if (!photoFile) {
      toast({ title: "Nenhuma foto selecionada", description: "Por favor, selecione uma foto para enviar.", variant: "destructive" });
      return;
    }
    const filePath = `${user.id}/${report.id}/resolution-${Date.now()}`;
    const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, photoFile);

    if (uploadError) {
      toast({ title: "Erro no upload da foto", description: uploadError.message, variant: "destructive" });
      return;
    }

    const { data: publicURLData } = supabase.storage.from('reports-media').getPublicUrl(filePath);

    const updatedReport = { 
      status: 'pending_resolution', 
      resolution_submission: {
        photoUrl: publicURLData.publicUrl,
        userId: user.id,
        userName: user.name,
        submittedAt: new Date().toISOString(),
      },
    };
    onUpdate({ id: report.id, ...updatedReport });
    setShowMarkResolvedModal(false);
    toast({ title: "Verificação enviada! ✅", description: "Sua foto de resolução foi enviada para moderação." });
  };

  const handleSubmitEvaluation = () => {
    if (evaluation.rating === 0) {
      toast({ title: "Avaliação incompleta", description: "Por favor, selecione uma nota de 1 a 5 estrelas.", variant: "destructive" });
      return;
    }
    const updatedReport = { evaluation: evaluation };
    onUpdate({ id: report.id, ...updatedReport });
    setShowEvaluation(false);
    toast({ title: "Avaliação enviada! ⭐", description: "Obrigado pelo seu feedback!" });
  };

  const handleReportError = () => {
    toast({ title: "Reportar Erro", description: "Obrigado por nos avisar. Nossa equipe irá analisar o problema.", variant: "default" });
  };

  const handleShare = async () => {
  // Pega a imagem da bronca (URL completa do Supabase)
  const reportImage = getReportImage();
  const baseUrl = window.location.origin;
  const defaultImage = `${baseUrl}/images/thumbnail.jpg`;
  
  // Usa a imagem da bronca se disponível, senão usa a padrão
  const shareImage = reportImage || defaultImage;

  const shareData = {
    title: `Trombone Cidadão: ${report.title}`,
    text: `Confira esta solicitação em Floresta-PE: "${report.title}". Protocolo: ${report.protocol}. Ajude a cobrar uma solução!`,
    url: `${baseUrl}/bronca/${report.id}`,
  };

  // Para WhatsApp, precisamos garantir que a imagem seja acessível publicamente
  console.log('Compartilhando imagem:', shareImage);

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      toast({ title: "Compartilhado com sucesso! 📣", description: "Obrigado por ajudar a divulgar." });
    } else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      toast({ title: "Link copiado! 📋", description: "O link da bronca foi copiado para sua área de transferência." });
    }
  } catch (error) {
    console.error('Error sharing:', error);
    
    // Fallback: copiar para área de transferência
    try {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      toast({ title: "Link copiado! 📋", description: "O link da bronca foi copiado para sua área de transferência." });
    } catch (clipboardError) {
      toast({ title: "Erro ao compartilhar", description: "Não foi possível compartilhar a solicitação.", variant: "destructive" });
    }
  }
};
  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para comentar.", variant: "destructive" });
      navigate('/login');
      return;
    }
    if (!newComment.trim()) return;

    const { error } = await supabase
      .from('comments')
      .insert({
        report_id: report.id,
        author_id: user.id,
        text: newComment,
        moderation_status: 'pending_approval',
      });

    if (error) {
      toast({ title: "Erro ao enviar comentário", description: error.message, variant: "destructive" });
    } else {
      setNewComment('');
      toast({ title: "Comentário enviado! 💬", description: "Seu comentário foi enviado para moderação e será publicado em breve." });
      onUpdate({ id: report.id }); // Trigger a refetch
    }
  };

  const handleEdit = () => {
    setEditData({ 
      ...report,
      newPhotos: [],
      newVideos: [],
      removedMedia: [],
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await onUpdate(editData); // Aguarda a atualização
      setIsSaving(false);
      setIsEditing(false);
      setEditData(null);
    } catch (error) {
      setIsSaving(false);
      // O erro já foi tratado no HomePage
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData(null);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (newLocation) => {
    setEditData(prev => ({ ...prev, location: newLocation }));
  };

  const handleFileChange = async (e, fileType) => {
    const files = Array.from(e.target.files);
    const mediaKey = fileType === 'photos' ? 'newPhotos' : 'newVideos';

    for (const file of files) {
      if (fileType === 'photos' && file.size > 10 * 1024 * 1024) {
        toast({ title: "Imagem muito grande!", description: "Use imagens de até 10MB.", variant: "destructive" });
        continue;
      }
      if (fileType === 'videos' && file.size > 50 * 1024 * 1024) {
        toast({ title: "Vídeo muito grande!", description: "Use vídeos de até 50MB.", variant: "destructive" });
        continue;
      }

      try {
        let processedFile = file;
        if (fileType === 'photos') {
          processedFile = await compressImage(file);
        }
        
        setEditData(prev => ({
          ...prev,
          [mediaKey]: [...prev[mediaKey], { file: processedFile, name: processedFile.name, url: URL.createObjectURL(processedFile) }]
        }));
        
      } catch (error) {
        toast({ title: "Erro ao processar arquivo", variant: "destructive" });
      }
    }
  };

  const removeMedia = (media, index, isNew) => {
    if (isNew) {
      const mediaKey = media.type === 'photo' ? 'newPhotos' : 'newVideos';
      setEditData(prev => ({
        ...prev,
        [mediaKey]: prev[mediaKey].filter((_, i) => i !== index)
      }));
    } else {
      const mediaKey = media.type === 'photo' ? 'photos' : 'videos';
      setEditData(prev => ({
        ...prev,
        [mediaKey]: prev[mediaKey].filter((_, i) => i !== index),
        removedMedia: [...prev.removedMedia, media.id]
      }));
    }
  };

  const handleAdminStatusChange = (newStatus) => {
    const updatedReport = { status: newStatus };
    onUpdate({ id: report.id, ...updatedReport });
    toast({ title: "Status atualizado!", description: `A bronca agora está "${getStatusInfo(newStatus).text}".` });
  };

  const handleAdminCategoryChange = (newCategory) => {
    const updatedReport = { category_id: newCategory };
    onUpdate({ id: report.id, ...updatedReport });
    toast({ title: "Categoria atualizada!", description: `A bronca foi movida para "${getCategoryName(newCategory)}".` });
  };

  const handleRecurrentClick = () => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login.", variant: "destructive" });
      return;
    }
    const updatedReport = { is_recurrent: !report.is_recurrent };
    onUpdate({ id: report.id, ...updatedReport });
    toast({ title: `Bronca marcada como ${updatedReport.is_recurrent ? 'reincidente' : 'não reincidente'}.` });
  };

  const handleResolutionAction = (action) => {
    if (onResolutionAction) {
      onResolutionAction(report, action);
      onClose();
    }
  };

  const handleApproveReport = async () => {
    const updatedReport = { 
      moderation_status: 'approved',
      status: 'pending' // Muda para pending após aprovação
    };
    
    try {
      await onUpdate({ id: report.id, ...updatedReport });
      toast({ 
        title: "Bronca aprovada com sucesso! ✅", 
        description: "A bronca foi aprovada e agora está visível para todos." 
      });
      onClose(); // Fecha o modal após aprovar
    } catch (error) {
      toast({ 
        title: "Erro ao aprovar bronca", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleRejectReport = async () => {
    const updatedReport = { 
      moderation_status: 'rejected'
    };
    
    try {
      await onUpdate({ id: report.id, ...updatedReport });
      toast({ 
        title: "Bronca rejeitada", 
        description: "A bronca foi rejeitada e não será publicada." 
      });
      onClose(); // Fecha o modal após rejeitar
    } catch (error) {
      toast({ 
        title: "Erro ao rejeitar bronca", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const statusInfo = getStatusInfo(report.status);
  const StatusIcon = statusInfo.icon;
  const canEdit = user && (user.is_admin || (user.id === report.author_id && report.moderation_status === 'pending_approval'));
  const canChangeStatus = user && (user.is_admin || user.user_type === 'public_official');
  const canModerate = user && user.is_admin; // Apenas admins podem moderar

  const allMedia = [
    ...(report.photos || []).map(p => ({ ...p, type: 'photo' })),
    ...(report.videos || []).map(v => ({ ...v, type: 'video' }))
  ];

  const editingMedia = isEditing ? [
    ...(editData.photos || []).map(p => ({ ...p, type: 'photo' })),
    ...(editData.videos || []).map(v => ({ ...v, type: 'video' })),
    ...(editData.newPhotos || []).map(p => ({ ...p, type: 'photo', isNew: true })),
    ...(editData.newVideos || []).map(v => ({ ...v, type: 'video', isNew: true })),
  ] : [];

  const openMediaViewer = (index) => {
    setMediaViewerState({ isOpen: true, startIndex: index });
  };

  const comments = Array.isArray(report.comments) ? report.comments : [];

  return (
    <>
      {/* DynamicSEO - Isso atualizará as meta tags quando o modal abrir */}
      <DynamicSEO {...seoData} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[2000]" onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="text-3xl mt-1">{getCategoryIcon(isEditing ? editData.category_id : report.category)}</div>
                <div>
                  {isEditing ? (
                    <input type="text" name="title" value={editData.title} onChange={handleEditChange} className="text-2xl font-bold bg-background border-b-2 border-primary w-full" />
                  ) : (
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                      {report.title}
                      {report.is_recurrent && <Repeat className="w-5 h-5 text-orange-500" title="Bronca Reincidente" />}
                    </h2>
                  )}
                  <p className="text-muted-foreground">{getCategoryName(isEditing ? editData.category_id : report.category)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Protocolo: {report.protocol}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* ... (resto do conteúdo do modal permanece igual) ... */}
            
            {/* Seção de Moderação de Resolução */}
            {isResolutionModeration && report.resolution_submission && (
              <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-700">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-400" /> Moderação de Resolução
                </h3>
                <div className="space-y-4">
                  <div className="bg-muted p-3 rounded-lg space-y-2">
                    <p className="text-sm">
                      <strong>Resolução enviada por:</strong> {report.resolution_submission.userName}
                    </p>
                    <p className="text-sm">
                      <strong>Enviado em:</strong> {formatDate(report.resolution_submission.submittedAt)}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setShowResolutionImage(true)}
                      className="gap-2 w-full"
                    >
                      <Eye className="w-4 h-4" />
                      Ver Foto da Resolução
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleResolutionAction('approved')}
                      className="bg-green-600 hover:bg-green-700 flex-1 gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Aprovar Resolução
                    </Button>
                    <Button
                      onClick={() => handleResolutionAction('rejected')}
                      variant="outline"
                      className="text-red-600 border-red-600 hover:bg-red-50 flex-1 gap-2"
                    >
                      <X className="w-4 h-4" />
                      Rejeitar Resolução
                    </Button>
                  </div>
                </div>
              </div>
            )}

                       {canChangeStatus && !isEditing && !isResolutionModeration && report.moderation_status === 'approved' && (
              <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-700">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Shield className="w-5 h-5 text-blue-400" /> Painel de Gestão</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Alterar Status</label>
                    <Select value={report.status} onValueChange={handleAdminStatusChange}>
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent className="z-[2100]">
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="in-progress">Em Andamento</SelectItem>
                        <SelectItem value="pending_resolution">Verificando Resolução</SelectItem>
                        {user?.is_admin && <SelectItem value="resolved">Resolvido</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  {user?.is_admin && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Alterar Categoria</label>
                      <Select value={report.category} onValueChange={handleAdminCategoryChange}>
                        <SelectTrigger className="w-full bg-background">
                          <SelectValue placeholder="Selecione a categoria" />
                        </SelectTrigger>
                        <SelectContent className="z-[2100]">
                          {Object.entries(categories).map(([key, value]) => (
                            <SelectItem key={key} value={key}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
                <StatusIcon className="w-4 h-4 mr-2" />
                {statusInfo.text}
                {report.moderation_status === 'pending_approval' && !isResolutionModeration && (
                  <span className="ml-2 text-xs bg-yellow-500 text-white px-2 py-1 rounded-full">
                    Aguardando Moderação
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Calendar className="w-4 h-4" /> 
                <span className="text-sm">Cadastrado em {formatDate(report.created_at)}</span>
              </div>
            </div>
            
            {report.status === 'duplicate' && (
              <div className="p-4 bg-gray-500/10 rounded-lg text-center">
                <h3 className="font-semibold text-gray-400 mb-2">Esta bronca foi marcada como duplicada.</h3>
                <p className="text-sm text-muted-foreground">Todas as atualizações serão concentradas na solicitação principal.</p>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-foreground mb-2">Descrição</h3>
              {isEditing ? (
                <textarea name="description" value={editData.description} onChange={handleEditChange} rows="4" className="w-full bg-background border border-input rounded-lg p-2" />
              ) : (
                <p className="text-muted-foreground">{report.description}</p>
              )}
            </div>
            
            {isEditing ? (
              <div>
                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Localização</h3>
                <div className="h-64 w-full rounded-lg overflow-hidden border border-input">
                  <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                    <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={editData.location} />
                  </Suspense>
                </div>
                <input type="text" name="address" value={editData.address} onChange={handleEditChange} className="w-full bg-background px-4 py-3 border border-input rounded-lg mt-3 focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Endereço de referência" />
              </div>
            ) : (
              report.address && <div className="flex items-center space-x-2 text-muted-foreground"><MapPin className="w-4 h-4" /><span className="text-sm">{report.address}</span></div>
            )}

            {(allMedia.length > 0 || isEditing) && (
              <div>
                <h3 className="font-semibold text-foreground mb-3">Imagens da Bronca</h3>
                <Carousel className="w-full" opts={{ align: "start", loop: false }}>
                  <CarouselContent className="-ml-2">
                    {(isEditing ? editingMedia : allMedia).map((media, index) => (
                      <CarouselItem key={media.id || media.name} className="pl-2 basis-1/2 sm:basis-1/3 md:basis-1/4">
                        <div className="w-full aspect-square rounded-lg overflow-hidden border border-border group bg-background flex items-center justify-center relative">
                          <button
                            type="button"
                            onClick={() => !isEditing && openMediaViewer(index)}
                            className="w-full h-full"
                          >
                            {media.type === 'photo' ? (
                              <img alt={`Mídia ${index + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" src={media.url} />
                            ) : (
                              <div className="text-center text-muted-foreground p-2 flex flex-col items-center justify-center h-full">
                                <Video className="w-8 h-8 mx-auto" />
                                <p className="text-xs mt-2 truncate">{media.name || `Vídeo ${index + 1}`}</p>
                              </div>
                            )}
                          </button>
                          {isEditing && <button onClick={(e) => { e.stopPropagation(); removeMedia(media, index, media.isNew); }} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full z-10"><Trash2 className="w-3 h-3" /></button>}
                        </div>
                      </CarouselItem>
                    ))}
                     {isEditing && (
                      <>
                        <CarouselItem className="pl-2 basis-1/2 sm:basis-1/3 md:basis-1/4">
                          <input type="file" accept="image/*" multiple onChange={(e) => handleFileChange(e, 'photos')} ref={photoInputRef} className="hidden" />
                          <button type="button" onClick={() => photoInputRef.current.click()} className="w-full aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted"><Camera className="w-8 h-8" /><span className="text-xs mt-1">Add Foto</span></button>
                        </CarouselItem>
                        <CarouselItem className="pl-2 basis-1/2 sm:basis-1/3 md:basis-1/4">
                          <input type="file" accept="video/mp4" multiple onChange={(e) => handleFileChange(e, 'videos')} ref={videoInputRef} className="hidden" />
                          <button type="button" onClick={() => videoInputRef.current.click()} className="w-full aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted"><Video className="w-8 h-8" /><span className="text-xs mt-1">Add Vídeo</span></button>
                        </CarouselItem>
                      </>
                    )}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}

            {report.status === 'resolved' && report.resolution_submission && (
              <div>
                <h3 className="font-semibold text-foreground mb-3">Prova da Resolução</h3>
                <div className="p-4 bg-green-500/10 rounded-lg">
                  <img 
                    src={report.resolution_submission.photoUrl} 
                    alt="Prova da resolução" 
                    className="rounded-lg w-full max-w-sm mx-auto cursor-pointer"
                    onClick={() => setShowResolutionImage(true)}
                  />
                  <p className="text-sm text-center mt-2 text-muted-foreground">
                    Resolvido em {formatDate(report.resolved_at)} por {report.resolution_submission.userName}.
                  </p>
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-foreground mb-3">Linha do Tempo</h3>
              <div className="space-y-4">
                {report.timeline && report.timeline.map((item, index) => {
                  const ItemIcon = getStatusInfo(item.status).icon;
                  const itemColor = getStatusInfo(item.status).color;
                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${itemColor}`}><ItemIcon className="w-4 h-4" /></div>
                      <div>
                        <p className="font-medium text-foreground">{item.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Comentários</h3>
              <div className="space-y-4 max-h-48 overflow-y-auto pr-2">
                {comments.length > 0 ? (
                  comments.map(comment => (
                    <div key={comment.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{comment.author?.name?.charAt(0) || '?'}</div>
                      <div className="flex-1 bg-background p-3 rounded-lg"><div className="flex items-center justify-between"><p className="font-semibold text-sm text-foreground">{comment.author?.name || 'Anônimo'}</p><p className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</p></div><p className="text-sm text-muted-foreground mt-1">{comment.text}</p></div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum comentário aprovado ainda.</p>
                )}
              </div>
              {user ? (
                <form onSubmit={handleSubmitComment} className="mt-4 flex gap-2">
                  <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Adicione seu comentário..." className="flex-1 bg-background px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" />
                  <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90"><Send className="w-4 h-4" /></Button>
                </form>
              ) : (
                <div className="mt-4 text-center p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <Link to="/login" className="font-semibold text-primary hover:underline">Faça login</Link> ou <Link to="/cadastro" className="font-semibold text-primary hover:underline">cadastre-se</Link> para comentar.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg">
              <div className="flex items-center space-x-2">
                <ThumbsUp className={`w-5 h-5 ${report.user_has_upvoted ? 'text-green-500 fill-green-500' : 'text-secondary'}`} />
                <span className="font-medium">{report.upvotes} apoios</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onFavoriteToggle(report.id, report.is_favorited)} className="gap-2">
                  <Star className={`w-4 h-4 ${report.is_favorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  {report.is_favorited ? 'Favoritado' : 'Favoritar'}
                </Button>
          
                <Button 
                  variant={report.user_has_upvoted ? "default" : "outline"}
                  onClick={() => onUpvote(report.id, report.upvotes, report.user_has_upvoted)} 
                  className={`gap-2 ${report.user_has_upvoted ? 'bg-green-500 hover:bg-green-600' : ''}`}
                  
                >
                  <ThumbsUp className={`w-4 h-4 ${report.user_has_upvoted ? 'fill-white' : ''}`} />
                  {report.user_has_upvoted ? 'Apoiado' : 'Apoiar'}
                </Button>
              </div>
            </div>

            {report.evaluation && (
              <div className="p-4 bg-green-500/10 rounded-lg">
                <h3 className="font-semibold text-green-400 mb-2">Avaliação do Serviço</h3>
                <div className="flex items-center space-x-2 mb-2">{[...Array(5)].map((_, i) => <Star key={i} className={`w-4 h-4 ${i < report.evaluation.rating ? 'text-yellow-400 fill-current' : 'text-muted-foreground'}`} />)}<span className="text-sm text-green-300">{report.evaluation.rating}/5 estrelas</span></div>
                {report.evaluation.comment && <p className="text-sm text-green-300 italic">"{report.evaluation.comment}"</p>}
              </div>
            )}

            {showEvaluation && (
              <div className="p-4 bg-blue-500/10 rounded-lg space-y-3">
                <h3 className="font-semibold text-blue-400">Avaliar Serviço</h3>
                <div className="flex space-x-1">{[...Array(5)].map((_, i) => <button key={i} type="button" onClick={() => setEvaluation(e => ({ ...e, rating: i + 1 }))}><Star className={`w-6 h-6 ${i < evaluation.rating ? 'text-yellow-400 fill-current' : 'text-muted-foreground hover:text-yellow-300'}`} /></button>)}</div>
                <textarea value={evaluation.comment} onChange={(e) => setEvaluation(ev => ({ ...ev, comment: e.target.value }))} rows={3} className="w-full bg-background px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Como foi o atendimento?" />
                <div className="flex space-x-2"><Button variant="outline" onClick={() => setShowEvaluation(false)} size="sm">Cancelar</Button><Button onClick={handleSubmitEvaluation} size="sm" className="bg-primary hover:bg-primary/90">Enviar Avaliação</Button></div>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-border">
              {isEditing ? (
                <>
                  <Button onClick={handleCancelEdit} variant="outline" className="flex-1 gap-2" disabled={isSaving}><X className="w-4 h-4" /> Cancelar</Button>
                  <Button onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-700 flex-1 gap-2" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar</>}
                  </Button>
                </>
              ) : (
                <>
                  {!isResolutionModeration && (
                  <>
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <Button onClick={handleShare} variant="secondary" className="gap-2 text-xs sm:text-sm">
                        <Share2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Compartilhar</span>
                        <span className="sm:hidden">Compart.</span>
                      </Button>
                      
                      {canEdit && (
                        <Button onClick={handleEdit} className="bg-blue-600 hover:bg-blue-700 gap-2 text-xs sm:text-sm">
                          <Edit className="w-4 h-4" />
                          <span className="hidden sm:inline">Editar</span>
                          <span className="sm:hidden">Edit.</span>
                        </Button>
                      )}
                      
                      {['pending', 'in-progress'].includes(report.status) && (
                        <Button onClick={handleMarkResolvedClick} className="bg-green-600 hover:bg-green-700 gap-2 text-xs sm:text-sm">
                          <CheckCircle className="w-4 h-4" />
                          <span className="hidden sm:inline">Marcar Resolvido</span>
                          <span className="sm:hidden">Resolvido</span>
                        </Button>
                      )}
                      
                      {report.status === 'resolved' && !report.evaluation && (
                        <Button onClick={() => setShowEvaluation(true)} variant="outline" className="gap-2 text-xs sm:text-sm">
                          <Star className="w-4 h-4" />
                          <span className="hidden sm:inline">Avaliar</span>
                          <span className="sm:hidden">Avaliar</span>
                        </Button>
                      )}
                      
                      {report.status === 'resolved' && user?.is_admin && (
                        <Button onClick={handleRecurrentClick} variant="outline" className="gap-2 text-xs sm:text-sm">
                          <Repeat className="w-4 h-4" />
                          <span className="hidden sm:inline">Reincidente</span>
                          <span className="sm:hidden">Rec.</span>
                        </Button>
                      )}
                      
                      {report.status !== 'duplicate' && user?.is_admin && (
                        <Button onClick={() => onLink(report)} variant="outline" className="gap-2 text-xs sm:text-sm">
                          <LinkIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">Vincular</span>
                          <span className="sm:hidden">Vinc.</span>
                        </Button>
                      )}
                      
                      <Button onClick={handleReportError} variant="ghost" className="text-muted-foreground hover:text-primary gap-2 text-xs sm:text-sm col-span-2">
                        <Flag className="w-4 h-4" />
                        Reportar Erro
                      </Button>
                    </div>
                  </>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Modal para visualizar a imagem da resolução */}
      {showResolutionImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[3000]"
          onClick={() => setShowResolutionImage(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-foreground">
                Foto da Resolução - {report.resolution_submission?.userName || 'Usuário'}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowResolutionImage(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-auto flex justify-center">
              <img
                src={report.resolution_submission?.photoUrl}
                alt="Foto da resolução enviada pelo usuário"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </motion.div>
        </motion.div>
      )}

      {mediaViewerState.isOpen && (
        <MediaViewer
          media={allMedia}
          startIndex={mediaViewerState.startIndex}
          onClose={() => setMediaViewerState({ isOpen: false, startIndex: 0 })}
        />
      )}
      {showMarkResolvedModal && (
        <MarkResolvedModal
          onClose={() => setShowMarkResolvedModal(false)}
          onSubmit={handleConfirmResolution}
        />
      )}
    </>
  );
};

export default ReportDetails;