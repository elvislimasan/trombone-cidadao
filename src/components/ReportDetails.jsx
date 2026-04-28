import React, { useState, useRef, lazy, Suspense, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { X, MapPin, Calendar, ThumbsUp, Star, CheckCircle, Clock, AlertTriangle, Flag, Share2, Video, Image as ImageIcon, MessageSquare, Send, Link as LinkIcon, Edit, Save, Trash2, Camera, Hourglass, Shield, Repeat, Check, Eye, Play, Loader2, ArrowRight, FileSignature, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useUpload } from '@/contexts/UploadContext';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Progress } from '@/components/ui/progress';
import MediaViewer from '@/components/MediaViewer';
import MarkResolvedModal from '@/components/MarkResolvedModal';
import { Combobox } from "@/components/ui/combobox";
import { supabase } from '@/lib/customSupabaseClient';
import DynamicSEO from './DynamicSeo';
import { Capacitor } from '@capacitor/core';
import { getReportShareUrl, getBaseAppUrl } from '@/lib/shareUtils';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { validateVideoFile } from '@/utils/videoProcessor';
import { ShareModal } from './PetitionComponents';


const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

// Componente para gerar thumbnail de vídeo
const VideoThumbnail = React.memo(({ videoUrl, alt, className, hidePlaceholder = false }) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [error, setError] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoUrl) return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;
    
    const handleLoadedMetadata = () => {
      try {
        video.currentTime = 0.1;
      } catch (e) {
        setError(true);
      }
    };

    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 400;
        canvas.height = video.videoHeight || 300;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        setThumbnail(thumbnailUrl);
      } catch (e) {
        setError(true);
      }
    };

    const handleError = () => {
      setError(true);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);
    
    videoRef.current = video;

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoRef.current.removeEventListener('seeked', handleSeeked);
        videoRef.current.removeEventListener('error', handleError);
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, [videoUrl]);

  if (error || !thumbnail) {
    return (
      <div className={`${className} bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700`}>
        <Video className="h-10 w-10 text-gray-400 mb-1" />
        <span className="text-[10px] text-gray-500 font-medium">Vídeo</span>
      </div>
    );
  }

  return <img src={thumbnail} alt={alt} className={className} />;
});

VideoThumbnail.displayName = 'VideoThumbnail';

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

const getThumbnailUrl = (url) => {
  if (!url) return '';
  // Se for blob ou data (preview local), retorna direto
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  
  // Se já for uma URL otimizada do wsrv, retorna ela
  if (url.includes('wsrv.nl')) return url;

  try {
     // Usa wsrv.nl para garantir thumbnail de QUALQUER imagem pública
     // Isso resolve o problema de imagens antigas do Supabase que não suportam transformação nativa
     // ou que possuem formatos de URL diferentes.
     const cleanUrl = url.split('?')[0];
     
     // w=500&h=500: Tamanho do thumbnail
     // fit=cover: Recorte inteligente
     // q=60: Qualidade otimizada
     // output=webp: Formato moderno
     return `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=500&h=500&fit=cover&q=60&output=webp`;
  } catch (e) {
    console.error('Erro ao gerar thumbnail:', e);
  }
  return url;
};



const ReportDetails = ({ 
  report, 
  onClose, 
  onUpdate, 
  onUpvote, 
  onLink, 
  onFavoriteToggle, 
  isModerationView = false,
  onDonate,
  variant = 'modal',
  startInEdit = false
}) => {
  const { user } = useAuth();
  const { activeUploads } = useUpload();
  const navigate = useNavigate();
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [evaluation, setEvaluation] = useState({ rating: 0, comment: '' });
  const [newComment, setNewComment] = useState('');
  const [isEditing, setIsEditing] = useState(startInEdit);
  const [editData, setEditData] = useState(() => {
    if (!startInEdit || !report) return null;
    return {
      ...report,
      newPhotos: [],
      newVideos: [],
      removedMedia: [],
    };
  });
  const { toast } = useToast();
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [mediaViewerState, setMediaViewerState] = useState({ isOpen: false, startIndex: 0 });
  const [showMarkResolvedModal, setShowMarkResolvedModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showResolutionImage, setShowResolutionImage] = useState(false);
  const [isRejectingReport, setIsRejectingReport] = useState(false);
  const [rejectionTitle, setRejectionTitle] = useState('');
  const [rejectionDescription, setRejectionDescription] = useState('');
  const [isModerationSaving, setIsModerationSaving] = useState(false);
  const [statusOverride, setStatusOverride] = useState(null);
  const [categoryOverride, setCategoryOverride] = useState(null);
  const [isCreatingPendingPole, setIsCreatingPendingPole] = useState(false);
  const [nearbyPoles, setNearbyPoles] = useState([]);
  const [nearbyPolesLoading, setNearbyPolesLoading] = useState(false);
  const [nearbyPolesError, setNearbyPolesError] = useState(null);

 
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
  const formatPoleLabel = (raw) => String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

  // Base URL memoizada para evitar recálculos
  const baseUrl = useMemo(() => getBaseAppUrl(), []);
  
  // Normalizar report.photos para garantir que seja sempre um array e ordenar por data de criação
  const reportPhotos = useMemo(() => {
    if (!report || !report.photos) return [];
    const photos = Array.isArray(report.photos) ? report.photos : [];
    // Ordenar por created_at para consistência (primeira foto é a primeira enviada)
    return [...photos].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }, [report?.photos]);
  
  // Função para obter a URL da imagem corretamente (calculada diretamente no seoData)
  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    
    // Calcular a imagem diretamente aqui para evitar dependências circulares
    let reportImage = defaultThumbnail;
    
    if (reportPhotos && reportPhotos.length > 0) {
      // Encontrar a primeira foto com URL válida
      const firstValidPhoto = reportPhotos.find(p => p.url || p.publicUrl || p.photo_url || p.image_url);
      
      if (firstValidPhoto) {
        const imageUrl = firstValidPhoto.url || 
           firstValidPhoto.publicUrl || 
           firstValidPhoto.photo_url || 
           firstValidPhoto.image_url;
        
        if (imageUrl) {
          // Garante que a URL seja absoluta
          if (imageUrl.startsWith('http')) {
            reportImage = imageUrl;
          } else if (imageUrl.startsWith('/')) {
            reportImage = `${baseUrl}${imageUrl}`;
          } else {
            reportImage = `${baseUrl}/${imageUrl}`;
          }
          
          // Otimizações para compartilhamento usando wsrv.nl (Proxy de redimensionamento robusto)
          try {
             const cleanUrl = reportImage.split('?')[0];
             reportImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=600&h=315&fit=cover&q=60&output=jpg`;
          } catch (e) {
             console.error('Erro ao processar URL da imagem:', e);
          }
        }
      }
    }
    
    const reportTitle = report?.title || '';
    const reportDescription = report?.description || '';
    const reportCategory = report?.category || null;
    const reportProtocol = report?.protocol || '';
    const reportId = report?.id || '';
    
    return {
      title: reportTitle ? `${reportTitle} - Trombone Cidadão` : 'Trombone Cidadão',
      description: reportDescription || `Solicitação de ${getCategoryName(reportCategory)} em Floresta-PE. Protocolo: ${reportProtocol}`,
      image: reportImage, // Retorna a imagem da bronca ou thumbnail padrão
      url: `${baseUrl}/bronca/${reportId}`,
    type: "article"
  };
  }, [baseUrl, report?.title, report?.description, report?.category, report?.protocol, report?.id, reportPhotos]);
  
  // getReportImage para uso no useEffect (calculado separadamente)
  // Garantir fallback para thumbnail padrão
  const getReportImage = seoData.image || `${baseUrl}/images/thumbnail.jpg`;

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
    
    let publicURLData = { publicUrl: null };

    if (photoFile) {
      // Converter para WEBP para reduzir tamanho mantendo qualidade
      let uploadFile = photoFile;
      try {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(photoFile);
        });
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
        uploadFile = new File([blob], (photoFile.name || 'resolution') .replace(/\.(jpe?g|png)$/i, '.webp'), { type: 'image/webp' });
      } catch (_) {}
      const filePath = `${user.id}/${report.id}/resolution-${Date.now()}`;
      const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, uploadFile);

      if (uploadError) {
        toast({ title: "Erro no upload da foto", description: uploadError.message, variant: "destructive" });
        return;
      }

      const { data } = supabase.storage.from('reports-media').getPublicUrl(filePath);
      publicURLData = data;
    }

    const isAdmin = user && user.is_admin;

    const updatedReport = { 
      status: isAdmin ? 'resolved' : 'pending_resolution', 
      resolution_submission: {
        photoUrl: publicURLData.publicUrl,
        userId: user.id,
        userName: user.name,
        submittedAt: new Date().toISOString(),
      },
      ...(isAdmin && { resolved_at: new Date().toISOString() })
    };
    
    try {
      await onUpdate({ id: report.id, ...updatedReport });
      setShowMarkResolvedModal(false);
    } catch (error) {
      console.error("Error updating report:", error);
    }
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
    // Pega a imagem da bronca (URL completa e absoluta)
    // getReportImage já retorna a thumbnail padrão se não houver imagem
    let shareImageUrl = getReportImage || `${baseUrl}/images/thumbnail.jpg`;
    
    // Garantir que a URL seja absoluta e válida
    if (!shareImageUrl || shareImageUrl.trim() === '') {
      shareImageUrl = `${baseUrl}/images/thumbnail.jpg`;
    }
    
    // Se não começar com http, adicionar baseUrl
    if (!shareImageUrl.startsWith('http')) {
      if (shareImageUrl.startsWith('/')) {
        shareImageUrl = `${baseUrl}${shareImageUrl}`;
      } else {
        shareImageUrl = `${baseUrl}/${shareImageUrl}`;
      }
    }
    
    const shareUrl = getReportShareUrl(report.id);
    const shareText = `*Trombone Cidadão*\n\n*${report.title || 'Bronca'}*\n\nVeja em:\n${shareUrl}`;
    
//     console.log('Generating Share URL:', shareUrl);

    // Se a imagem não for válida, use a thumbnail padrão
    if (!shareImageUrl || shareImageUrl.includes('thumbnail.jpg')) {
//         console.warn('Sharing with default thumbnail because no valid report image was found.');
    } else {
//         console.log('Sharing with report image:', shareImageUrl);
    }

    // const shareText = `Confira esta solicitação em Floresta-PE: "${report.title}". Protocolo: ${report.protocol}. Ajude a cobrar uma solução!`;
    // const fullShareText = `${shareText} ${shareUrl}`; 



    
    // IMPORTANTE: Garantir que as meta tags estejam atualizadas antes de compartilhar
    // Forçar atualização imediatamente antes de compartilhar
    const updateMetaTagsBeforeShare = () => {
      // Remover TODAS as meta tags de imagem existentes
      const selectorsToRemove = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:width"]',
        'meta[property="og:image:height"]',
        'meta[property="og:image:type"]',
        'meta[property="og:image:alt"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:alt"]',
        'meta[name="image"]',
        'link[rel="image_src"]',
      ];
      
      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });
      
      // Criar TODAS as meta tags necessárias com a imagem correta
      const metaTags = [
        { property: 'property', value: 'og:image', content: shareImageUrl },
        { property: 'property', value: 'og:image:url', content: shareImageUrl },
        { property: 'property', value: 'og:image:width', content: '1200' },
        { property: 'property', value: 'og:image:height', content: '630' },
        { property: 'property', value: 'og:image:type', content: 'image/jpeg' },
        { property: 'property', value: 'og:image:alt', content: report?.title || 'Trombone Cidadão' },
        { property: 'name', value: 'twitter:image', content: shareImageUrl },
        { property: 'name', value: 'twitter:image:alt', content: report?.title || 'Trombone Cidadão' },
        { property: 'name', value: 'image', content: shareImageUrl },
      ];
      
      metaTags.forEach(({ property, value, content }) => {
        const element = document.createElement('meta');
        element.setAttribute(property, value);
        element.setAttribute('content', content);
        document.head.insertBefore(element, document.head.firstChild);
      });
      
      // Criar link image_src
      const imageSrc = document.createElement('link');
      imageSrc.setAttribute('rel', 'image_src');
      imageSrc.setAttribute('href', shareImageUrl);
      document.head.insertBefore(imageSrc, document.head.firstChild);
      
      // Garantir que og:image seja a PRIMEIRA meta tag no head
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) {
        document.head.insertBefore(ogImage, document.head.firstChild);
      }
      
      // Log para debug (remover em produção)
      // console.log('Meta tags atualizadas antes de compartilhar:', {
      //   shareImageUrl,
      //   shareUrl,
      //   ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      // });
    };
    
    // Atualizar meta tags antes de compartilhar (múltiplas vezes para garantir)
    updateMetaTagsBeforeShare();
    setTimeout(updateMetaTagsBeforeShare, 50);
    setTimeout(updateMetaTagsBeforeShare, 200);

    try {
      // Tentar usar Capacitor Share primeiro (app nativo)
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
        
        // No app nativo, compartilhar o link (a imagem aparecerá como thumbnail via meta tags geradas pela Edge Function)
        const shareData = {
          title: 'Trombone Cidadão',
          text: shareText,
        };

        await Share.share(shareData);
        toast({ title: "Compartilhado com sucesso! 📣", description: "Obrigado por ajudar a divulgar." });
        return;
      }

      // Tentar usar Web Share API (navegadores modernos)
    if (navigator.share) {
        // IMPORTANTE: Priorizar o link. A imagem aparecerá como thumbnail via meta tags Open Graph
        // Não incluir files, pois isso pode fazer o navegador ignorar o URL
        const webShareData = {
          title: 'Trombone Cidadão',
          text: shareText,
        };
        
        // Verificar se pode compartilhar com URL (sempre deve poder)
        if (navigator.canShare && !navigator.canShare(webShareData)) {
          // Continuar mesmo assim, alguns navegadores não implementam canShare corretamente
        }
        
        await navigator.share(webShareData);
      toast({ title: "Compartilhado com sucesso! 📣", description: "Obrigado por ajudar a divulgar." });
        return;
      }

      // Fallback: copiar link
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ 
          title: "Texto copiado!", 
          description: "Cole nas suas redes sociais." 
        });
      } catch (clipboardError) {
        toast({ 
          title: "Erro ao copiar", 
          description: "Não foi possível copiar o link." 
        });
    }
  } catch (error) {
      // Se o usuário cancelar, não mostrar erro
      if (error.name === 'AbortError') {
        return;
      }
      
    console.error('Error sharing:', error);
    
      // Fallback: apenas copiar link
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ 
          title: "Texto copiado!", 
          description: "Cole nas suas redes sociais." 
        });
      } catch (fallbackError) {
        toast({ 
          title: "Erro ao compartilhar", 
          description: "Não foi possível compartilhar a solicitação. Tente copiar o link manualmente.", 
          variant: "destructive" 
        });
    }
  }
};

  const handleWhatsAppShare = () => {
    const shareUrl = getReportShareUrl(report.id);
    const shareText = `*Trombone Cidadão*\n\n*${report.title || 'Bronca'}*\n\nVeja em:\n${shareUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
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
      if (startInEdit) {
        setIsSaving(false);
        onClose();
        return;
      }
      setIsSaving(false);
      setIsEditing(false);
      setEditData(null);
    } catch (error) {
      setIsSaving(false);
      // O erro já foi tratado no HomePage
    }
  };

  const handleCancelEdit = () => {
    if (startInEdit) {
      onClose();
      return;
    }
    setIsEditing(false);
    setEditData(null);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditPoleNumberChange = (e) => {
    const raw = e.target.value;
    const normalized = formatPoleLabel(raw);
    setEditData(prev => ({
      ...prev,
      pole_number: raw,
      pole_id: null,
      reported_pole_distance_m: null,
      reported_post_identifier: normalized || null,
      reported_plate: normalized || null,
    }));
  };

  const handleCreatePendingPoleForEdit = async () => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa estar logado para cadastrar poste.", variant: "destructive" });
      navigate('/login');
      return;
    }
    if (!user?.is_admin) {
      toast({ title: "Acesso restrito", description: "Apenas administradores podem cadastrar postes no mapa.", variant: "destructive" });
      return;
    }
    if (!editData) return;

    const lat = editData.location?.lat;
    const lng = editData.location?.lng;
    const normalizedIdentifier = formatPoleLabel(editData.pole_number);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast({ title: "Localização obrigatória", description: "Ajuste a localização no mapa antes de cadastrar o poste.", variant: "destructive" });
      return;
    }
    if (!normalizedIdentifier) {
      toast({ title: "Número do poste obrigatório", description: "Informe o número/plaqueta para cadastrar o poste.", variant: "destructive" });
      return;
    }

    setIsCreatingPendingPole(true);
    try {
      const { data, error } = await supabase.rpc('create_pending_pole', {
        p_lat: lat,
        p_lng: lng,
        p_identifier: normalizedIdentifier,
        p_address: editData.address || null,
        p_plate: null,
      });
      if (error) throw error;

      const createdPole = Array.isArray(data) ? data[0] : data;
      if (!createdPole?.pole_id) {
        throw new Error('Não foi possível obter o ID do poste criado.');
      }

      setEditData(prev => ({
        ...prev,
        pole_id: createdPole.pole_id,
        pole_number: normalizedIdentifier,
        reported_pole_distance_m: 0,
        reported_post_identifier: createdPole.identifier || normalizedIdentifier,
        reported_plate: createdPole.plate ?? normalizedIdentifier,
      }));

      toast({
        title: "Poste cadastrado!",
        description: "Poste cadastrado no mapa e vinculado à bronca."
      });
    } catch (createPoleError) {
      toast({
        title: "Erro ao cadastrar poste",
        description: createPoleError?.message || "Não foi possível cadastrar o poste agora.",
        variant: "destructive"
      });
    } finally {
      setIsCreatingPendingPole(false);
    }
  };

  const handleLocationChange = (newLocation) => {
    setEditData(prev => ({ ...prev, location: newLocation }));
  };

  useEffect(() => {
    let cancelled = false;

    if (!isEditing || editData?.category_id !== 'iluminacao' || !editData?.location) {
      setNearbyPoles([]);
      setNearbyPolesLoading(false);
      setNearbyPolesError(null);
      return;
    }

    const { lat, lng } = editData.location;
    const timer = setTimeout(async () => {
      setNearbyPolesLoading(true);
      setNearbyPolesError(null);

      const { data, error } = await supabase.rpc('nearest_poles', {
        lat,
        lng,
        radius_m: 80,
        max_results: 5,
      });

      if (cancelled) return;

      if (error) {
        setNearbyPoles([]);
        setNearbyPolesError(error.message || 'Falha ao buscar postes próximos');
        setNearbyPolesLoading(false);
        return;
      }

      setNearbyPoles(Array.isArray(data) ? data : []);
      setNearbyPolesLoading(false);
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isEditing, editData?.category_id, editData?.location?.lat, editData?.location?.lng]);

  const handleFileChange = async (e, fileType) => {
    const files = Array.from(e.target.files);
    const mediaKey = fileType === 'photos' ? 'newPhotos' : 'newVideos';

    for (const file of files) {
      // Remoção de bloqueios rígidos de tamanho.
      // O sistema deve tentar processar qualquer tamanho e falhar graciosamente se necessário.
      
      try {
        let processedFile = file;
        
        // Apenas alertar se for muito grande, mas tentar processar
        if (fileType === 'photos' && file.size > 20 * 1024 * 1024) {
//              console.warn('Imagem grande detectada, processamento pode levar alguns segundos.');
             toast({ title: "Processando imagem grande...", description: "Aguarde enquanto otimizamos sua foto." });
        }

        if (fileType === 'photos') {
          processedFile = await compressImage(file);
        }
        
        if (fileType === 'videos') {
           try {
             await validateVideoFile(file);
           } catch (e) {
             toast({ title: "Vídeo inválido", description: e.message, variant: "destructive" });
             continue;
           }
        }

        // Se ainda for vídeo muito grande após (tentativa de) validação, avisar
        if (fileType === 'videos' && file.size > 200 * 1024 * 1024) {
           toast({ title: "Vídeo muito grande", description: "O upload pode demorar.", variant: "default" });
        }
        
        setEditData(prev => ({
          ...prev,
          [mediaKey]: [...prev[mediaKey], { file: processedFile, name: processedFile.name, url: URL.createObjectURL(processedFile) }]
        }));
        
      } catch (error) {
        console.error("Erro ao processar arquivo:", error);
        toast({ title: "Erro ao processar arquivo", description: "Tente um arquivo menor ou diferente.", variant: "destructive" });
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

  useEffect(() => {
    setStatusOverride(null);
    setCategoryOverride(null);
    setIsRejectingReport(false);
    setRejectionTitle('');
    setRejectionDescription('');
  }, [report?.id]);

  const handleAdminStatusChange = async (newStatus) => {
    if (!report?.id) return;
    const previous = statusOverride ?? report.status;
    setStatusOverride(newStatus);
    try {
      await onUpdate({ id: report.id, status: newStatus });
      toast({ title: "Status atualizado!", description: `A bronca agora está "${getStatusInfo(newStatus).text}".` });
    } catch (error) {
      setStatusOverride(previous);
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    }
  };

  const handleAdminCategoryChange = async (newCategory) => {
    if (!report?.id) return;
    const previous = categoryOverride ?? report.category;
    setCategoryOverride(newCategory);
    try {
      await onUpdate({ id: report.id, category_id: newCategory, category: newCategory });
      toast({ title: "Categoria atualizada!", description: `A bronca foi movida para "${getCategoryName(newCategory)}".` });
    } catch (error) {
      setCategoryOverride(previous);
      toast({ title: "Erro ao atualizar categoria", description: error.message, variant: "destructive" });
    }
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

  const handleResolutionAction = async (action) => {
    if (!user || !user.is_admin) {
      toast({
        title: "Acesso restrito",
        description: "Apenas administradores podem moderar resoluções.",
        variant: "destructive"
      });
      return;
    }

    let updateData = {};
    
    if (action === 'approved') {
      updateData = { 
        status: 'resolved',
        resolved_at: new Date().toISOString()
      };
    } else if (action === 'rejected') {
      updateData = { 
        status: 'pending',
        resolution_submission: null
      };
    }

    try {
      await onUpdate({ id: report.id, ...updateData });
      const actionText = action === 'approved' ? 'aprovada' : 'rejeitada';
      toast({ 
        title: `Resolução ${actionText} com sucesso!`,
        description: action === 'approved' 
          ? 'A bronca foi marcada como resolvida.' 
          : 'A bronca voltou para o status pendente.'
      });
      onClose();
    } catch (error) {
      toast({ 
        title: "Erro ao processar resolução", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  const handleApproveReport = async () => {
    const updatedReport = { 
      moderation_status: 'approved',
      status: 'pending',
      rejection_title: null,
      rejection_description: null,
      rejected_at: null
    };

    const shouldRetryWithoutRejectionFields = (err) => {
      const msg = String(err?.message || '');
      if (err?.code === 'PGRST204') return true;
      if (msg.includes('schema cache') && msg.includes('reports')) return true;
      if (msg.includes("Could not find the 'rejection_")) return true;
      if (msg.includes("Could not find the 'rejected_at'")) return true;
      return false;
    };

    const stripRejectionFields = (obj) => {
      const { rejection_title, rejection_description, rejected_at, ...rest } = obj || {};
      return rest;
    };
    
    try {
      setIsModerationSaving(true);
      if (typeof onUpdate === 'function') {
        await onUpdate({ id: report.id, ...updatedReport });
      } else {
        let { error } = await supabase.from('reports').update(updatedReport).eq('id', report.id);
        if (error && shouldRetryWithoutRejectionFields(error)) {
          ({ error } = await supabase.from('reports').update(stripRejectionFields(updatedReport)).eq('id', report.id));
        }
        if (error) throw error;
      }
      toast({ 
        title: "Bronca aprovada com sucesso! ✅", 
        description: "A bronca foi aprovada e agora está visível para todos." 
      });
      setIsRejectingReport(false);
      setRejectionTitle('');
      setRejectionDescription('');
      onClose(); // Fecha o modal após aprovar
    } catch (error) {
      toast({ 
        title: "Erro ao aprovar bronca", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setIsModerationSaving(false);
    }
  };

  const handleRejectReport = async () => {
    setRejectionTitle('');
    setRejectionDescription('');
    setIsRejectingReport(true);
  };

  const confirmRejectReport = async () => {
    if (!rejectionTitle.trim() || !rejectionDescription.trim()) return;
    if (!user?.is_admin) {
      toast({
        title: "Acesso restrito",
        description: "Apenas administradores podem rejeitar broncas.",
        variant: "destructive"
      });
      return;
    }
    if (!report?.author_id) {
      toast({
        title: "Erro ao rejeitar",
        description: "Autor da bronca não encontrado.",
        variant: "destructive"
      });
      return;
    }

    setIsModerationSaving(true);

    const updatedReport = {
      moderation_status: 'rejected',
      rejection_title: rejectionTitle.trim(),
      rejection_description: rejectionDescription.trim(),
      rejected_at: new Date().toISOString()
    };

    try {
      if (typeof onUpdate === 'function') {
        await onUpdate({ id: report.id, ...updatedReport });
      } else {
        let { error } = await supabase.from('reports').update(updatedReport).eq('id', report.id);
        if (error && shouldRetryWithoutRejectionFields(error)) {
          ({ error } = await supabase.from('reports').update(stripRejectionFields(updatedReport)).eq('id', report.id));
        }
        if (error) throw error;
      }

      try {
        await supabase.functions.invoke('send-report-status-email', {
          body: {
            reportId: report.id,
            authorId: report.author_id,
            status: 'rejected',
            rejectionTitle: rejectionTitle.trim(),
            rejectionDescription: rejectionDescription.trim(),
            reportTitle: report.title,
            reportUrl: `${window.location.origin}/painel-usuario?tab=reports&report=${report.id}`
          }
        });
      } catch (emailError) {
        console.error('Erro ao enviar e-mail de notificação:', emailError);
      }

      toast({
        title: "Bronca rejeitada",
        description: "O autor foi notificado com o motivo da recusa."
      });
      setIsRejectingReport(false);
      setRejectionTitle('');
      setRejectionDescription('');
      onClose();
    } catch (error) {
      toast({
        title: "Erro ao rejeitar bronca",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsModerationSaving(false);
    }
  };

  const effectiveStatus = statusOverride ?? report.status;
  const effectiveCategory = categoryOverride ?? report.category;
  const statusInfo = getStatusInfo(effectiveStatus);
  const StatusIcon = statusInfo.icon;
  const canEdit = user && (user.is_admin || (user.id === report.author_id && report.moderation_status === 'pending_approval'));
  const canChangeStatus = user && (user.is_admin || user.user_type === 'public_official');
  const canModerate = user && user.is_admin; // Apenas admins podem moderar
  // Determina se há resolução pendente para moderação (apenas para admins)
  const isResolutionModeration = canModerate && report.status === 'pending_resolution' && report.resolution_submission;

  const pendingUploads = useMemo(() => {
    if (!activeUploads) return [];
    return Object.values(activeUploads)
      .filter(u => u.reportId === report.id && u.status !== 'completed' && u.status !== 'error')
      .map(u => ({
        id: u.id,
        type: u.type || 'video',
        url: u.previewUrl || null,
        isUploading: true,
        progress: u.progress,
        name: u.name
      }));
  }, [activeUploads, report.id]);

  const allMedia = useMemo(() => {
    const pendingNames = new Set(pendingUploads.map(u => u.name));
    
    return [
      ...pendingUploads,
      ...(report.photos || [])
        .filter(p => !pendingNames.has(p.name))
        .map(p => ({ ...p, type: 'photo' })),
      ...(report.videos || [])
        .filter(v => !pendingNames.has(v.name))
        .map(v => ({ ...v, type: 'video' }))
    ];
  }, [pendingUploads, report.photos, report.videos]);

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

  // Forçar atualização das meta tags quando o modal abrir
  useEffect(() => {
    // Sempre atualizar meta tags, mesmo se report ainda não carregou (usará thumbnail padrão)
    // Garantir que sempre há uma imagem (thumbnail padrão se necessário)
    const reportImage = getReportImage || `${baseUrl}/images/thumbnail.jpg`;
    
    if (!reportImage) {
      return;
    }
    
    // Atualizar imediatamente
    const updateMetaTags = () => {
      
      // PRIMEIRO: Remover TODAS as meta tags de imagem existentes para evitar conflitos
      const selectorsToRemove = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:width"]',
        'meta[property="og:image:height"]',
        'meta[property="og:image:type"]',
        'meta[property="og:image:alt"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:alt"]',
        'meta[name="image"]',
        'link[rel="image_src"]',
      ];
      
      selectorsToRemove.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          el.remove();
        });
      });
      
      // SEGUNDO: Criar novas meta tags com a imagem correta
      const metaTags = [
        { property: 'property', value: 'og:image', content: reportImage },
        { property: 'property', value: 'og:image:url', content: reportImage },
        { property: 'property', value: 'og:image:width', content: '1200' },
        { property: 'property', value: 'og:image:height', content: '630' },
        { property: 'property', value: 'og:image:type', content: 'image/jpeg' },
        { property: 'property', value: 'og:image:alt', content: report?.title || 'Bronca' },
        { property: 'name', value: 'twitter:image', content: reportImage },
        { property: 'name', value: 'twitter:image:alt', content: report?.title || 'Bronca' },
        { property: 'name', value: 'image', content: reportImage },
      ];
      
      metaTags.forEach(({ property, value, content }) => {
        const element = document.createElement('meta');
        element.setAttribute(property, value);
        element.setAttribute('content', content);
        document.head.appendChild(element);
      });
      
      // Criar link image_src
      const imageSrcLink = document.createElement('link');
      imageSrcLink.setAttribute('rel', 'image_src');
      imageSrcLink.setAttribute('href', reportImage);
      document.head.appendChild(imageSrcLink);
      
      // TERCEIRO: Garantir que a meta tag og:image seja a PRIMEIRA no <head>
      // WhatsApp e outras redes sociais geralmente pegam a primeira meta tag
      const ogImageElement = document.querySelector('meta[property="og:image"]');
      if (ogImageElement && ogImageElement.getAttribute('content') === reportImage) {
        // Mover para o início do <head> se não estiver lá
        const firstChild = document.head.firstChild;
        if (firstChild !== ogImageElement) {
          document.head.insertBefore(ogImageElement, firstChild);
        }
      }
      
      // Verificar se ainda há alguma meta tag com thumbnail padrão e remover
      const allOgImages = document.querySelectorAll('meta[property="og:image"]');
      allOgImages.forEach((el) => {
        const content = el.getAttribute('content');
        if (content && (content.includes('thumbnail.jpg') || content !== reportImage)) {
          el.remove();
        }
      });
      
      // Garantir que há apenas UMA meta tag og:image com a imagem correta
      const remainingOgImages = document.querySelectorAll('meta[property="og:image"]');
      if (remainingOgImages.length === 0) {
        const newOgImage = document.createElement('meta');
        newOgImage.setAttribute('property', 'og:image');
        newOgImage.setAttribute('content', reportImage);
        document.head.insertBefore(newOgImage, document.head.firstChild);
      } else if (remainingOgImages.length > 1) {
        // Manter apenas a primeira e remover as outras
        for (let i = 1; i < remainingOgImages.length; i++) {
          remainingOgImages[i].remove();
        }
      }
      
      // Verificação final e limpeza
      const finalOgImage = document.querySelector('meta[property="og:image"]');
      if (finalOgImage) {
        const finalContent = finalOgImage.getAttribute('content');
        
        // Se ainda contém thumbnail, forçar atualização
        if (finalContent?.includes('thumbnail.jpg') && finalContent !== reportImage) {
          finalOgImage.setAttribute('content', reportImage);
          // Mover para o início
          document.head.insertBefore(finalOgImage, document.head.firstChild);
        }
      } else {
        // Se não encontrou, criar novamente
        const newOgImage = document.createElement('meta');
        newOgImage.setAttribute('property', 'og:image');
        newOgImage.setAttribute('content', reportImage);
        document.head.insertBefore(newOgImage, document.head.firstChild);
      }
      
      // Verificação final após delay para garantir que não foi sobrescrito
      setTimeout(() => {
        const checkOgImage = document.querySelector('meta[property="og:image"]');
        if (checkOgImage) {
          const checkContent = checkOgImage.getAttribute('content');
          if (checkContent !== reportImage && checkContent?.includes('thumbnail.jpg')) {
            checkOgImage.setAttribute('content', reportImage);
            document.head.insertBefore(checkOgImage, document.head.firstChild);
          }
        }
      }, 1500);
    };
    
    // Atualizar imediatamente
    updateMetaTags();
    
    // Atualizar após delays para garantir que sobrescreva qualquer coisa do App.jsx
    // Usar intervalos maiores para garantir que o App.jsx já renderizou
    const timers = [
      setTimeout(updateMetaTags, 50),
      setTimeout(updateMetaTags, 200),
      setTimeout(updateMetaTags, 500),
      setTimeout(updateMetaTags, 1000),
      setTimeout(updateMetaTags, 2000),
    ];
    
    // Usar MutationObserver para detectar quando meta tags são alteradas e atualizar novamente
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'attributes') {
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage && ogImage.getAttribute('content') !== reportImage && !ogImage.getAttribute('content')?.includes('thumbnail.jpg')) {
            // Se a meta tag foi alterada e não é a nossa imagem, atualizar novamente
            updateMetaTags();
          }
        }
      });
    });
    
    // Observar mudanças no <head>
    observer.observe(document.head, {
      childList: true,
      attributes: true,
      attributeFilter: ['content', 'href'],
      subtree: true,
    });
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      observer.disconnect();
    };
  }, [report?.id, reportPhotos, baseUrl, getReportImage]);


  const isPageVariant = variant === 'page';

  const cardContent = (
    <motion.div
      initial={{ scale: isPageVariant ? 1 : 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: isPageVariant ? 1 : 0.9, opacity: 0 }}
      className={
        isPageVariant
          ? 'w-full'
          : 'bg-card rounded-2xl shadow-2xl border border-border max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto'
      }
      onClick={(e) => !isPageVariant && e.stopPropagation()}
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="text-3xl mt-1">{getCategoryIcon(isEditing ? editData.category_id : report.category)}</div>
            <div>
              {isEditing ? (
                <input type="text" name="title" value={editData.title} onChange={handleEditChange} className="text-2xl font-bold bg-background border-b-2 border-primary w-full" />
              ) : (
                <h2 className="text-2xl font-bold text-foreground flex items-center flex-wrap gap-2">
                  {report.title}
                  {report.is_recurrent && <Repeat className="w-5 h-5 text-orange-500" title="Bronca Reincidente" />}
                </h2>
              )}
              <p className="text-muted-foreground">{getCategoryName(isEditing ? editData.category_id : report.category)}</p>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                <p className="text-xs text-muted-foreground">Protocolo: {report.protocol}</p>
              </div>
              {report.category === 'iluminacao' && report.pole_number && (
                <p className="text-xs font-semibold text-primary mt-1 flex items-center gap-1">
                  N° do Poste: {report.pole_number}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="p-6 space-y-6">
            <>
            {/* Seção de Moderação de Bronca (para admins) */}
            {canModerate && !isEditing  && (report.moderation_status === 'pending_approval' || report.moderation_status === 'rejected') && (
              <div className={`p-4 rounded-lg border ${report.moderation_status === 'pending_approval' ? 'bg-yellow-900/20 border-yellow-700' : 'bg-red-900/20 border-red-700'}`}>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Shield className={`w-5 h-5 ${report.moderation_status === 'pending_approval' ? 'text-yellow-400' : 'text-red-400'}`} /> 
                  Moderação de Bronca
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {report.moderation_status === 'pending_approval' 
                    ? 'Esta bronca está aguardando aprovação. Revise o conteúdo e decida se deve ser publicada.'
                    : 'Esta bronca foi rejeitada. Você pode reavaliar e aprová-la se necessário.'}
                </p>
                {isRejectingReport ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Título</div>
                      <input
                        value={rejectionTitle}
                        onChange={(e) => setRejectionTitle(e.target.value)}
                        placeholder="Ex: Falta de informações essenciais"
                        className="w-full bg-background border border-input rounded-lg p-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Descrição</div>
                      <textarea
                        value={rejectionDescription}
                        onChange={(e) => setRejectionDescription(e.target.value)}
                        placeholder="Explique o que precisa ser ajustado para reenviar a bronca."
                        rows={4}
                        className="w-full bg-background border border-input rounded-lg p-2"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { setIsRejectingReport(false); setRejectionTitle(''); setRejectionDescription(''); }}
                        className="flex-1"
                        disabled={isModerationSaving}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={confirmRejectReport}
                        className="flex-1 gap-2"
                        disabled={isModerationSaving || !rejectionTitle.trim() || !rejectionDescription.trim()}
                      >
                        <X className="w-4 h-4" />
                        Confirmar Rejeição
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleApproveReport}
                      className="bg-green-600 hover:bg-green-700 flex-1 gap-2"
                      disabled={isModerationSaving}
                    >
                      <Check className="w-4 h-4" />
                      {report.moderation_status === 'rejected' ? 'Reaprovar Bronca' : 'Aprovar Bronca'}
                    </Button>
                    {report.moderation_status === 'pending_approval' && (
                      <Button
                        onClick={handleRejectReport}
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50 flex-1 gap-2"
                        disabled={isModerationSaving}
                      >
                        <X className="w-4 h-4" />
                        Rejeitar Bronca
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isEditing && report.moderation_status === 'rejected' && (report.rejection_title || report.rejection_description) && (
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-900/10 overflow-hidden shadow-sm">
                <div className="bg-red-100/60 dark:bg-red-900/30 px-4 py-3 flex items-center gap-2 border-b border-red-200 dark:border-red-900/50">
                  <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-300" />
                  <h3 className="font-semibold text-red-900 dark:text-red-100">Motivo da Recusa</h3>
                </div>
                <div className="p-4 space-y-2">
                  {report.rejection_title && (
                    <p className="font-semibold text-foreground">{report.rejection_title}</p>
                  )}
                  {report.rejection_description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{report.rejection_description}</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Seção de Moderação de Resolução */}
            {isResolutionModeration && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10 overflow-hidden shadow-sm">
                <div className="bg-blue-100/50 dark:bg-blue-900/30 px-4 py-3 flex items-center gap-2 border-b border-blue-200 dark:border-blue-800">
                  <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">Análise de Resolução</h3>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Content Row: User Info + Photo */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* User Info Section */}
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-700">
                        <span className="text-blue-700 dark:text-blue-300 font-bold text-lg">
                          {report.resolution_submission.userName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Enviado por</p>
                        <p className="font-medium text-foreground text-base">{report.resolution_submission.userName}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(report.resolution_submission.submittedAt)}
                        </div>
                      </div>
                    </div>

                    {/* Photo Evidence Section - Compact */}
                    {report.resolution_submission.photoUrl && (
                      <div className="flex flex-col items-end">
                        <div 
                          className="relative w-24 h-24 rounded-lg overflow-hidden border border-border cursor-pointer group shadow-sm hover:shadow-md transition-all bg-muted"
                          onClick={() => setShowResolutionImage(true)}
                          title="Clique para ampliar"
                        >
                          <img 
                            src={report.resolution_submission.photoUrl} 
                            alt="Foto da resolução" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-200 drop-shadow-lg" />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Ver comprovante
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button
                      onClick={() => handleResolutionAction('approved')}
                      className="bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow active:scale-[0.98] transition-all h-10"
                    >
                      <Check className="w-4 h-4 mr-2" /> Aprovar
                    </Button>
                    <Button
                      onClick={() => handleResolutionAction('rejected')}
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/50 dark:hover:bg-red-900/20 active:scale-[0.98] transition-all h-10"
                    >
                      <X className="w-4 h-4 mr-2" /> Rejeitar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Foto da Resolução - Mostrar para todos quando houver resolução pendente (exceto na seção de moderação) */}
            {!isEditing && !isResolutionModeration && report.resolution_submission && report.status === 'pending_resolution' && (
              <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hourglass className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-muted-foreground">
                      Resolução enviada e aguardando aprovação
                    </span>
                  </div>
                  {report.resolution_submission.photoUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowResolutionImage(true)}
                      className="gap-2 text-xs"
                    >
                      <Eye className="w-4 h-4" />
                      Ver foto da resolução
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sem foto</span>
                  )}
                </div>
              </div>
            )}

            {canChangeStatus && !isEditing && !isResolutionModeration && report.moderation_status === 'approved' && (
              <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-700">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2"><Shield className="w-5 h-5 text-blue-400" /> Painel de Gestão</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Alterar Status</label>
                    <Combobox
                      value={effectiveStatus}
                      onChange={handleAdminStatusChange}
                      options={[
                        { value: "pending", label: "Pendente" },
                        { value: "in-progress", label: "Em Andamento" },
                        { value: "pending_resolution", label: "Verificando Resolução" },
                        ...(user?.is_admin ? [{ value: "resolved", label: "Resolvido" }] : [])
                      ]}
                      placeholder="Selecione o status"
                      searchPlaceholder="Buscar status..."
                    />
                  </div>
                  {user?.is_admin && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Alterar Categoria</label>
                      <Combobox
                        value={effectiveCategory}
                        onChange={handleAdminCategoryChange}
                        options={Object.entries(categories).map(([key, value]) => ({ value: key, label: value }))}
                        placeholder="Selecione a categoria"
                        searchPlaceholder="Buscar categoria..."
                      />
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
                    <LocationPickerMap
                      onLocationChange={handleLocationChange}
                      initialPosition={editData.location}
                      overlayMarkers={
                        editData?.category_id === 'iluminacao'
                          ? nearbyPoles
                              .filter(
                                (p) =>
                                  Number.isFinite(p?.latitude) &&
                                  Number.isFinite(p?.longitude)
                              )
                              .map((p) => ({
                                id: p.pole_id,
                                title:
                                  formatPoleLabel(p.plate || p.identifier) ||
                                  `Poste ${p.pole_id}`,
                                distanceLabel:
                                  p.distance_m != null ? `${p.distance_m}m` : "",
                                isBroken: !!p.is_broken,
                                location: { lat: p.latitude, lng: p.longitude },
                                data: p,
                              }))
                          : []
                      }
                      selectedOverlayMarkerId={editData?.pole_id}
                      onOverlayMarkerSelect={(m) => {
                        setEditData((prev) => ({
                          ...prev,
                          pole_id: m.id,
                          reported_pole_distance_m: m.data?.distance_m ?? null,
                          reported_post_identifier: m.data?.identifier ?? null,
                          reported_plate: m.data?.plate ?? null,
                          pole_number: formatPoleLabel(
                            m.data?.plate || m.data?.identifier || m.title || m.id
                          ),
                          address: prev.address?.trim()
                            ? prev.address
                            : m.data?.address || prev.address || "",
                        }));
                      }}
                      showSatelliteToggle={true}
                    />
                  </Suspense>
                </div>
                {editData?.category_id === 'iluminacao' && (
                  <div className="mt-3 space-y-2">
                    {nearbyPolesLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando postes no mapa...
                      </div>
                    )}

                    {!nearbyPolesLoading && nearbyPolesError && (
                      <p className="text-xs text-destructive">{nearbyPolesError}</p>
                    )}

                    {!nearbyPolesLoading &&
                      !nearbyPolesError &&
                      nearbyPoles.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Clique no ícone do poste no mapa para selecionar.
                        </p>
                      )}

                    {!nearbyPolesLoading &&
                      !nearbyPolesError &&
                      nearbyPoles.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum poste encontrado perto desta localização.
                        </p>
                      )}
                  </div>
                )}
                <input type="text" name="address" value={editData.address} onChange={handleEditChange} className="w-full bg-background px-4 py-3 border border-input rounded-lg mt-3 focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Endereço de referência" />
              </div>
            ) : (
              report.address && <div className="flex items-center space-x-2 text-muted-foreground"><MapPin className="w-4 h-4" /><span className="text-sm">{report.address}</span></div>
            )}

            {isEditing && (editData?.category_id === 'iluminacao' || report?.category === 'iluminacao') && (
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground mb-2">Poste</h3>
                <input
                  type="text"
                  name="pole_number"
                  value={editData?.pole_number || ''}
                  onChange={handleEditPoleNumberChange}
                  className="w-full bg-background px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="N°/plaqueta do poste"
                />
                {user?.is_admin && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreatePendingPoleForEdit}
                    disabled={isCreatingPendingPole || !editData?.location || !formatPoleLabel(editData?.pole_number)}
                    className="w-full sm:w-auto"
                  >
                    {isCreatingPendingPole ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cadastrando poste...
                      </>
                    ) : (
                      "Cadastrar poste no mapa"
                    )}
                  </Button>
                )}
                {editData?.pole_id && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      Poste vinculado: #{editData.pole_id}
                    </span>
                    {Number.isFinite(Number(editData?.reported_pole_distance_m)) && (
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                        Distância: {Number(editData.reported_pole_distance_m)}m
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {isEditing && (editData?.category_id === 'buracos' || report?.category === 'buracos') && (
              <div className="mt-4">
                <h3 className="font-semibold text-foreground mb-2">Informação adicional</h3>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={!!editData?.is_from_water_utility}
                    onChange={(e) =>
                      setEditData(prev => ({ ...prev, is_from_water_utility: e.target.checked }))
                    }
                    className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <span>
                    Buraco aberto por obras de companhia de abastecimento de água/esgoto
                  </span>
                </label>
              </div>
            )}

            {(allMedia.length > 0 || isEditing) && (
              <div>
                <h3 className="font-semibold text-foreground mb-3">Imagens e Vídeos da Bronca</h3>
                <Carousel className="w-full" opts={{ align: "start", loop: false }}>
                  <CarouselContent className="-ml-2">
                    {(isEditing ? editingMedia : allMedia).map((media, index) => (
                      <CarouselItem key={media.id || media.name} className="pl-2 basis-1/2 sm:basis-1/3 md:basis-1/4">
                        <div className="w-full aspect-square rounded-lg overflow-hidden border border-border group bg-background flex items-center justify-center relative">
                          <button
                            type="button"
                            onClick={() => !isEditing && !media.isUploading && openMediaViewer(index)}
                            className={`w-full h-full ${media.isUploading ? 'cursor-default' : ''}`}
                            disabled={media.isUploading}
                          >
                            {media.type === 'photo' ? (
                              <div className="relative w-full h-full">
                                <img alt={`Mídia ${index + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" src={getThumbnailUrl(media.url)} />
                                {media.isUploading && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 p-2">
                                    <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                                    <span className="text-white text-xs font-medium mb-2">Enviando...</span>
                                    <Progress value={media.progress} className="h-1.5 w-3/4" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="relative w-full h-full">
                                <VideoThumbnail 
                                  videoUrl={media.url} 
                                  alt={media.name || `Vídeo ${index + 1}`} 
                                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                                {media.isUploading ? (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 p-2">
                                    <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                                    <span className="text-white text-xs font-medium mb-2">Enviando...</span>
                                    <Progress value={media.progress} className="h-1.5 w-3/4" />
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                                    <div className="bg-white/90 rounded-full p-3 shadow-lg group-hover:scale-110 transition-transform">
                                      <Play className="w-6 h-6 text-foreground fill-foreground" />
                                    </div>
                                  </div>
                                )}
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

            {/* Foto da Resolução - Mostrar para todos quando estiver resolvida */}
            {!isEditing && !isResolutionModeration && report.status === 'resolved' && report.resolution_submission && (
              <div className="p-3 bg-green-500/10 rounded-lg border border-green-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-muted-foreground">
                      Resolvido em {formatDate(report.resolved_at)} por {report.resolution_submission.userName}
                    </span>
                  </div>
                  {report.resolution_submission.photoUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowResolutionImage(true)}
                      className="gap-2 text-xs"
                    >
                      <Eye className="w-4 h-4" />
                      Ver foto da resolução
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sem foto</span>
                  )}
                </div>
              </div>
            )}

            {/* Foto da Resolução - Mostrar para todos em outros status (caso haja resolução submetida mas não aprovada/rejeitada) */}
            {!isEditing && !isResolutionModeration && report.resolution_submission && 
             report.status !== 'pending_resolution' && 
             report.status !== 'resolved' && (
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-muted-foreground">
                      Foto de resolução disponível
                    </span>
                  </div>
                  {report.resolution_submission.photoUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowResolutionImage(true)}
                      className="gap-2 text-xs"
                    >
                      <Eye className="w-4 h-4" />
                      Ver foto da resolução
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Sem foto</span>
                  )}
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
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">{comment.author?.name?.charAt(0) || '?'}</div>
                      <div className="flex-1 min-w-0 bg-background p-3 rounded-lg">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-semibold text-sm text-foreground truncate">{comment.author?.name || 'Anônimo'}</p>
                          <p className="text-xs text-muted-foreground flex-shrink-0">{formatDate(comment.created_at)}</p>
                        </div>
                        <p className="text-sm text-muted-foreground break-words">{comment.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum comentário aprovado ainda.</p>
                )}
              </div>
              {user ? (
                <form onSubmit={handleSubmitComment} className="mt-4 flex gap-2">
                  <input 
                    type="text" 
                    value={newComment} 
                    onChange={(e) => setNewComment(e.target.value)} 
                    placeholder="Adicione seu comentário..." 
                    className="flex-1 min-w-0 bg-background px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm" 
                  />
                  <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90 flex-shrink-0"><Send className="w-4 h-4" /></Button>
                </form>
              ) : (
                <div className="mt-4 text-center p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <Link to="/login" className="font-semibold text-primary hover:underline">Faça login</Link> ou <Link to="/cadastro" className="font-semibold text-primary hover:underline">cadastre-se</Link> para comentar.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-background rounded-lg">
              <div className="flex items-center space-x-2 flex-shrink-0">
                <ThumbsUp className={`w-4 h-4 sm:w-5 sm:h-5 ${report.user_has_upvoted ? 'text-green-500 fill-green-500' : 'text-secondary'}`} />
                <span className="font-medium text-sm sm:text-base">{report.upvotes} apoios</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={() => onFavoriteToggle(report.id, report.is_favorited)} 
                  className="gap-1 sm:gap-2 flex-1 sm:flex-initial text-xs sm:text-sm px-2 sm:px-4"
                  size="sm"
                >
                  <Star className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${report.is_favorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  <span className="truncate">{report.is_favorited ? 'Favoritado' : 'Favoritar'}</span>
                </Button>
          
                <Button 
                  variant={report.user_has_upvoted ? "default" : "outline"}
                  onClick={() => onUpvote(report.id, report.upvotes, report.user_has_upvoted)} 
                  className={`gap-1 sm:gap-2 flex-1 sm:flex-initial text-xs sm:text-sm px-2 sm:px-4 ${report.user_has_upvoted ? 'bg-green-500 hover:bg-green-600' : ''}`}
                  size="sm"
                >
                  <ThumbsUp className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${report.user_has_upvoted ? 'fill-white' : ''}`} />
                  <span className="truncate">{report.user_has_upvoted ? 'Apoiado' : 'Apoiar'}</span>
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
                      {report.petitionId && ['open', 'victory', 'closed'].includes(report.petitionStatus) && (
                        <Button asChild className="bg-yellow-600 hover:bg-yellow-700 gap-2 text-xs sm:text-sm">
                          <Link to={`/abaixo-assinado/${report.petitionId}`}>
                            <FileSignature className="w-4 h-4" />
                            <span className="hidden sm:inline">Ver Abaixo-Assinado</span>
                            <span className="sm:hidden">Assinaturas</span>
                          </Link>
                        </Button>
                      )}
                      <Button onClick={handleShare} variant="secondary" className="gap-2 text-xs sm:text-sm">
                        <Share2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Compartilhar</span>
                        <span className="sm:hidden">Compart.</span>
                      </Button>

                      <Button onClick={handleWhatsAppShare} variant="outline" className="hidden sm:flex gap-2 text-xs sm:text-sm border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.347-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        <span className="hidden sm:inline">WhatsApp</span>
                        <span className="sm:hidden">Whats</span>
                      </Button>
                      
                      {canEdit && (
                        <Button onClick={handleEdit} className="bg-blue-600 hover:bg-blue-700 gap-2 text-xs sm:text-sm">
                          <Edit className="w-4 h-4" />
                          <span className="hidden sm:inline">Editar</span>
                          <span className="sm:hidden">Edit.</span>
                        </Button>
                      )}
                      
                      {['pending', 'in-progress'].includes(report.status) && 
                       !report.resolution_submission && 
                       (user?.id === report.author_id || user?.is_admin || user?.user_type === 'public_official') && (
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
          </>
        </div>
    </motion.div>
  );

  return (
    <>
      <DynamicSEO key={`report-${report?.id}`} {...seoData} />

      {isPageVariant ? (
        <div className="flex flex-col min-h-screen bg-[#F9FAFB] md:px-6">
          <div className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-6 max-w-[88rem] mx-auto w-full">
            <div className="max-w-4xl mx-auto">{cardContent}</div>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[2000]"
          onClick={onClose}
        >
          {cardContent}
        </motion.div>
      )}

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


      
      <ShareModal 
        isOpen={showShareModal} 
        onClose={() => setShowShareModal(false)} 
        url={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-report?id=${report.id}`} 
        title={report.title} 
      />
    </>
  );
};

export default ReportDetails;
