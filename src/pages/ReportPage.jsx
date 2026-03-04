import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import LinkReportModal from '@/components/LinkReportModal';
import ReportDetails from '@/components/ReportDetails';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useUpvote } from '../hooks/useUpvotes';
import DynamicSEO from '../components/DynamicSeo';
import DonationModal from '@/components/DonationModal';
import MarkResolvedModal from '@/components/MarkResolvedModal';
import MediaViewer from '@/components/MediaViewer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  ThumbsUp,
  Star,
  Share2,
  Flag,
  MessageSquare,
  Send,
  FileSignature,
  Hash,
  Droplet,
  Shield,
  Edit,
  CheckCircle,
  Link as LinkIcon,
  Play,
  Image,
} from 'lucide-react';
import { Share } from '@capacitor/share';

const ReportPage = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showMarkResolvedModal, setShowMarkResolvedModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [mediaViewerState, setMediaViewerState] = useState({
    isOpen: false,
    startIndex: 0,
  });
  const [showEditDetails, setShowEditDetails] = useState(false);
  const { handleUpvote } = useUpvote();

  // Função para obter URL base correta (não localhost no app) - MOVIDA PARA CIMA
  const getBaseUrl = useCallback(() => {
    let baseUrl;
    
    // 1. Prioridade: Variável de ambiente (configurada no Vercel)
    if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    }
    // 2. Se estiver no app nativo, sempre usar produção
    else if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    // 3. Se estiver no navegador, detectar automaticamente o ambiente
    else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      
      // Se for localhost, usar localhost
      if (origin.includes('localhost')) {
        baseUrl = origin;
      }
      // Se for Vercel (dev), usar Vercel
      else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        baseUrl = origin;
      }
      // Se for domínio de produção, usar produção
      else if (origin.includes('trombonecidadao.com.br')) {
        baseUrl = 'https://trombonecidadao.com.br';
      }
      // Fallback: usar a origem atual
      else {
        baseUrl = origin;
      }
    }
    // 4. Fallback final: produção
    else {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    
    // Remover barra final se existir para evitar barras duplas
    return baseUrl.replace(/\/$/, '');
  }, []);

  // Base URL memoizada para evitar recálculos - MOVIDA PARA CIMA
  const baseUrl = useMemo(() => getBaseUrl(), [getBaseUrl]);
  
  // Normalizar report.photos para garantir que seja sempre um array - MOVIDA PARA CIMA
  const reportPhotos = useMemo(() => {
    if (!report || !report.photos) return [];
    return Array.isArray(report.photos) ? report.photos : [];
  }, [report?.photos]);
  
  // Calcular imagem e dados SEO diretamente - MOVIDA PARA CIMA
  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    
    // Calcular a imagem diretamente aqui
    let reportImage = defaultThumbnail;
    
    if (reportPhotos && reportPhotos.length > 0) {
      const firstPhoto = reportPhotos[0];
      if (firstPhoto) {
        const imageUrl = firstPhoto.url || firstPhoto.publicUrl || firstPhoto.photo_url || firstPhoto.image_url;
        
        if (imageUrl) {
          // Garante que a URL seja absoluta
          if (imageUrl.startsWith('http')) {
            reportImage = imageUrl;
          } else {
            reportImage = `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
          }
          
          // Otimizações para compartilhamento usando wsrv.nl
          try {
             const cleanUrl = reportImage.split('?')[0];
             reportImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=600&h=315&fit=cover&q=60&output=jpg`;
          } catch (e) { console.error(e); }
        }
      }
    }
    
    // Garantir que sempre há uma imagem válida
    if (!reportImage || reportImage.trim() === '') {
      reportImage = defaultThumbnail;
    }
    
    const reportTitle = report?.title || '';
    const reportDescription = report?.description || '';
    const reportProtocol = report?.protocol || '';
    const currentReportId = report?.id || reportId || '';
    
    return {
      title: reportTitle ? `Bronca: ${reportTitle} - Trombone Cidadão` : 'Trombone Cidadão',
      description: reportDescription || `Confira esta solicitação em Floresta-PE: "${reportTitle}". Protocolo: ${reportProtocol}`,
      image: reportImage, // Sempre retorna uma imagem válida
      url: `${baseUrl}/bronca/${currentReportId}`,
    };
  }, [baseUrl, report?.title, report?.description, report?.protocol, report?.id, reportId, reportPhotos]);

  const seoTitle = seoData.title;
  const seoDescription = seoData.description;
  const seoImage = seoData.image; // Sempre retorna uma imagem
  const seoUrl = seoData.url;

  const categories = {
    iluminacao: 'Iluminação Pública',
    buracos: 'Buracos na Via',
    esgoto: 'Esgoto Entupido',
    limpeza: 'Limpeza Urbana',
    poda: 'Poda de Árvore',
    'vazamento-de-agua': 'Vazamento de Água',
    outros: 'Outros',
  };

  const getCategoryIcon = (category) => {
    const map = {
      iluminacao: '💡',
      buracos: '🕳️',
      esgoto: '🚰',
      limpeza: '🧹',
      poda: '🌳',
      outros: '📍',
      'vazamento-de-agua': '💧',
    };
    return map[category] || '📍';
  };

  const getCategoryName = (category) => categories[category] || 'Outros';

  const getStatusInfo = (status) => {
    const info = {
      pending: { text: 'Pendente', colorClasses: 'bg-red-50 text-red-600 border border-red-100' },
      'in-progress': { text: 'Em Andamento', colorClasses: 'bg-amber-50 text-amber-600 border border-amber-100' },
      resolved: { text: 'Resolvido', colorClasses: 'bg-green-50 text-green-600 border border-green-100' },
      duplicate: { text: 'Duplicada', colorClasses: 'bg-gray-50 text-gray-600 border border-gray-200' },
      pending_resolution: { text: 'Verificando Resolução', colorClasses: 'bg-blue-50 text-blue-600 border border-blue-100' },
      pending_approval: { text: 'Aguardando Aprovação', colorClasses: 'bg-yellow-50 text-yellow-700 border border-yellow-100' },
    };
    return info[status] || info.pending;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const comments = useMemo(
    () => (Array.isArray(report?.comments) ? report.comments : []),
    [report?.comments],
  );

  const mediaItems = useMemo(() => {
    if (!report) return [];
    const photos = Array.isArray(report.photos) ? report.photos : [];
    const videos = Array.isArray(report.videos) ? report.videos : [];
    return [...photos, ...videos];
  }, [report?.photos, report?.videos]);

  const viewerMedia = useMemo(
    () =>
      mediaItems
        .map((item, index) => {
          const url =
            item.url ||
            item.publicUrl ||
            item.photo_url ||
            item.image_url ||
            item.video_url;
          if (!url) return null;
          const type =
            item.type === 'video' || item.type === 'video_url'
              ? 'video'
              : item.type === 'photo' || item.type === 'image'
              ? item.type
              : 'image';
          return {
            ...item,
            url,
            type,
            _index: index,
          };
        })
        .filter(Boolean),
    [mediaItems],
  );

  const waterUtilityName = useMemo(() => {
    if (!report || !report.is_from_water_utility) return null;
    const address = (report.address || '').toLowerCase();
    const locationText = (report.categoryName || '').toLowerCase();
    const hasPernambucoText =
      address.includes('pernambuco') ||
      address.includes('-pe') ||
      address.endsWith(' pe') ||
      locationText.includes('pernambuco');

    let isPernambucoByCoordinates = false;
    if (report.location && typeof report.location.lat === 'number' && typeof report.location.lng === 'number') {
      const { lat, lng } = report.location;
      const minLat = -9.8;
      const maxLat = -7.2;
      const minLng = -41.5;
      const maxLng = -34.8;
      isPernambucoByCoordinates =
        lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    }

    const isPernambuco = hasPernambucoText || isPernambucoByCoordinates;
    if (isPernambuco) return 'COMPESA';
    return 'companhia de abastecimento de água/esgoto';
  }, [report]);

  const isFromWaterUtility = !!report?.is_from_water_utility;
  const canChangeStatus =
    !!user &&
    !!report &&
    (user.is_admin || user.user_type === 'public_official');
  const canEditCategory = !!user && !!report && user.is_admin;
  const canManageWaterUtility =
    !!report && report.category === 'buracos' && canEditCategory;

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: 'Acesso restrito',
        description: 'Você precisa fazer login para comentar.',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }
    if (!newComment.trim() || !report) return;

    const { error } = await supabase.from('comments').insert({
      report_id: report.id,
      author_id: user.id,
      text: newComment,
      moderation_status: 'pending_approval',
    });

    if (error) {
      toast({
        title: 'Erro ao enviar comentário',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setNewComment('');
      toast({
        title: 'Comentário enviado! 💬',
        description: 'Seu comentário foi enviado para moderação e será publicado em breve.',
      });
      fetchReport();
    }
  };

  const handleReportError = () => {
    toast({
      title: 'Reportar erro',
      description: 'Obrigado por avisar. Vamos analisar esta bronca.',
    });
  };

  const handleShare = async () => {
    if (!report) return;
    const shareUrl = seoUrl || `${baseUrl}/bronca/${report.id}`;
    const title = report.title ? `Trombone Cidadão: ${report.title}` : 'Trombone Cidadão';

    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
        await Share.share({ title, url: shareUrl });
        toast({
          title: 'Compartilhado com sucesso! 📣',
          description: 'Obrigado por ajudar a divulgar.',
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({ title, url: shareUrl });
        toast({
          title: 'Compartilhado com sucesso! 📣',
          description: 'Obrigado por ajudar a divulgar.',
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: 'Link copiado!',
        description: 'Cole nas suas redes sociais.',
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: 'Link copiado!',
          description: 'Cole nas suas redes sociais.',
        });
      } catch {
        toast({
          title: 'Erro ao compartilhar',
          description: 'Não foi possível compartilhar a bronca. Tente copiar o link manualmente.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleAdminStatusChange = async (newStatus) => {
    if (!report || !canChangeStatus) return;
    const { error } = await supabase
      .from('reports')
      .update({ status: newStatus })
      .eq('id', report.id);
    if (error) {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setReport((prev) => (prev ? { ...prev, status: newStatus } : prev));
    toast({
      title: 'Status atualizado',
      description: `A bronca agora está como "${getStatusInfo(newStatus).text}".`,
    });
  };

  const handleAdminCategoryChange = async (newCategory) => {
    if (!report || !canEditCategory) return;
    const updates = { category_id: newCategory };
    if (newCategory !== 'buracos') {
      updates.is_from_water_utility = null;
    }
    const { error } = await supabase
      .from('reports')
      .update(updates)
      .eq('id', report.id);
    if (error) {
      toast({
        title: 'Erro ao atualizar categoria',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setReport((prev) =>
      prev
        ? {
            ...prev,
            category: newCategory,
            is_from_water_utility:
              newCategory === 'buracos' ? prev.is_from_water_utility : null,
          }
        : prev,
    );
    toast({
      title: 'Categoria atualizada',
      description: `Categoria alterada para "${getCategoryName(newCategory)}".`,
    });
  };

  const handleAdminWaterUtilityChange = async (value) => {
    if (!report || !canManageWaterUtility) return;
    const isYes = value === 'yes';
    const { error } = await supabase
      .from('reports')
      .update({ is_from_water_utility: isYes })
      .eq('id', report.id);
    if (error) {
      toast({
        title: 'Erro ao atualizar informação',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setReport((prev) =>
      prev ? { ...prev, is_from_water_utility: isYes } : prev,
    );
    toast({
      title: 'Informação atualizada',
      description: `Campo "Aberto pela COMPESA?" definido como ${
        isYes ? 'Sim' : 'Não'
      }.`,
    });
  };

  const handleUpvoteClick = async () => {
    if (!report) return;
    const result = await handleUpvote(report.id, report.upvotes, report.user_has_upvoted);
    if (result.success) {
      setReport((prev) =>
        prev
          ? {
              ...prev,
              upvotes: result.newUpvotes,
              user_has_upvoted: result.newUserHasUpvoted,
            }
          : prev,
      );
    }
  };

  const handleEditClick = () => {
    if (!report) return;
    if (!user) {
      toast({
        title: 'Acesso restrito',
        description: 'Você precisa fazer login para editar broncas.',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }
    if (!(user.is_admin || user.user_type === 'public_official')) {
      toast({
        title: 'Acesso restrito',
        description: 'Somente gestores podem editar esta bronca.',
        variant: 'destructive',
      });
      return;
    }
    setShowEditDetails(true);
  };

  const handleMarkResolvedClick = () => {
    if (!report) return;
    if (!user) {
      toast({
        title: 'Acesso restrito',
        description: 'Você precisa fazer login para marcar como resolvida.',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }
    if (!(user.is_admin || user.user_type === 'public_official')) {
      toast({
        title: 'Acesso restrito',
        description: 'Somente gestores podem marcar como resolvida.',
        variant: 'destructive',
      });
      return;
    }
    setShowMarkResolvedModal(true);
  };

  const handleConfirmResolution = async (resolutionData) => {
    if (!report || !user) return;
    const { photoFile } = resolutionData;

    let publicURLData = { publicUrl: null };

    if (photoFile) {
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
        const blob = await canvas.convertToBlob({
          type: 'image/webp',
          quality: 0.9,
        });
        uploadFile = new File(
          [blob],
          (photoFile.name || 'resolution').replace(
            /\.(jpe?g|png)$/i,
            '.webp',
          ),
          { type: 'image/webp' },
        );
      } catch (_) {}
      const filePath = `${user.id}/${report.id}/resolution-${Date.now()}`;
      const { error: uploadError } = await supabase.storage
        .from('reports-media')
        .upload(filePath, uploadFile);

      if (uploadError) {
        toast({
          title: 'Erro no upload da foto',
          description: uploadError.message,
          variant: 'destructive',
        });
        return;
      }

      const { data } = supabase.storage
        .from('reports-media')
        .getPublicUrl(filePath);
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
      ...(isAdmin && { resolved_at: new Date().toISOString() }),
    };

    const { error } = await supabase
      .from('reports')
      .update(updatedReport)
      .eq('id', report.id);

    if (error) {
      toast({
        title: 'Erro ao atualizar bronca',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setReport((prev) => (prev ? { ...prev, ...updatedReport } : prev));
    setShowMarkResolvedModal(false);
    toast({
      title: 'Bronca atualizada',
      description: isAdmin
        ? 'Bronca marcada como resolvida.'
        : 'Resolução enviada para revisão.',
    });
  };

  const managementPanel =
    canChangeStatus && report?.moderation_status === 'approved' ? (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <Accordion type="single" collapsible defaultValue="">
          <AccordionItem value="management" className="border-b-0">
            <AccordionTrigger className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2 hover:no-underline">
              <span className="inline-flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                <span className="tracking-[0.18em]">Painel de Gestão</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5 py-4 space-y-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                  Alterar Status
                </div>
                <Select value={report.status} onValueChange={handleAdminStatusChange}>
                  <SelectTrigger className="w-full bg-white border-gray-200 text-xs">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent className="z-[2100]">
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in-progress">Em Andamento</SelectItem>
                    <SelectItem value="pending_resolution">
                      Verificando Resolução
                    </SelectItem>
                    {user?.is_admin && (
                      <SelectItem value="resolved">Resolvido</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {canEditCategory && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                    Alterar Categoria
                  </div>
                  <Select
                    value={report.category}
                    onValueChange={handleAdminCategoryChange}
                  >
                    <SelectTrigger className="w-full bg-white border-gray-200 text-xs">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent className="z-[2100]">
                      {Object.entries(categories).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {canManageWaterUtility && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                    Aberto pela COMPESA?
                  </div>
                  <Select
                    value={isFromWaterUtility ? 'yes' : 'no'}
                    onValueChange={handleAdminWaterUtilityChange}
                  >
                    <SelectTrigger className="w-full bg-white border-gray-200 text-xs">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="z-[2100]">
                      <SelectItem value="yes">Sim</SelectItem>
                      <SelectItem value="no">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    ) : null;

  // Forçar atualização das meta tags quando a página carregar
  // Isso garante que as meta tags estejam corretas quando o WhatsApp fizer o fetch
  useEffect(() => {
    // Sempre atualizar meta tags, mesmo se report ainda não carregou (usará thumbnail padrão)
    // Garantir que sempre há uma imagem (thumbnail padrão se necessário)
    const imageToUse = seoImage || `${baseUrl}/images/thumbnail.jpg`;
    if (!imageToUse) return;
    
    const updateMetaTags = () => {
      // Remover todas as meta tags de imagem existentes
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
        elements.forEach(el => el.remove());
      });
      
      // Criar novas meta tags com a imagem correta
      const metaTags = [
        { property: 'property', value: 'og:image', content: imageToUse },
        { property: 'property', value: 'og:image:url', content: imageToUse },
        { property: 'property', value: 'og:image:width', content: '1200' },
        { property: 'property', value: 'og:image:height', content: '630' },
        { property: 'property', value: 'og:image:type', content: 'image/jpeg' },
        { property: 'property', value: 'og:image:alt', content: seoTitle || 'Trombone Cidadão' },
        { property: 'name', value: 'twitter:image', content: imageToUse },
        { property: 'name', value: 'twitter:image:alt', content: seoTitle || 'Trombone Cidadão' },
        { property: 'name', value: 'image', content: imageToUse },
      ];
      
      metaTags.forEach(({ property, value, content }) => {
        const element = document.createElement('meta');
        element.setAttribute(property, value);
        element.setAttribute('content', content);
        document.head.insertBefore(element, document.head.firstChild);
      });
      
      // Criar link image_src
      const imageSrcLink = document.createElement('link');
      imageSrcLink.setAttribute('rel', 'image_src');
      imageSrcLink.setAttribute('href', imageToUse);
      document.head.insertBefore(imageSrcLink, document.head.firstChild);
      
      // Garantir que og:image seja a primeira
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.getAttribute('content') === imageToUse) {
        document.head.insertBefore(ogImage, document.head.firstChild);
      }
      
    };
    
    // Atualizar imediatamente e após delays
    updateMetaTags();
    const timers = [
      setTimeout(updateMetaTags, 100),
      setTimeout(updateMetaTags, 500),
      setTimeout(updateMetaTags, 1000),
    ];
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [report?.id, reportPhotos, seoImage, seoTitle, baseUrl]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      if (reportId) {
        await supabase.rpc('increment_views', { table_name: 'reports', item_id: reportId });
      }
    } catch (e) {
      console.error('Falha ao incrementar visualizações da bronca:', e);
    }
    const { data, error } = await supabase
      .from('reports')
      .select(`
        *, 
        pole_number,
        category:categories(name, icon), 
        author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), 
        comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), 
        timeline:report_timeline(*), 
        report_media(*), 
        upvotes:signatures(count),
        favorite_reports(user_id),
        petitions(id, status)
      `)
      .eq('id', reportId)
      .single();

    if (error || !data) {
      setLoading(false);
      toast({
        title: "Bronca não encontrada",
        description: "A solicitação que você está procurando não existe ou foi removida.",
        variant: "destructive"
      });
      // Usar setTimeout para navegar após a renderização completa
      setTimeout(() => navigate('/'), 0);
      return;
    }
    
    // Verificar se o usuário já assinou
    let userHasSigned = false;
    if (user) {
      const { data: sig } = await supabase
        .from('signatures')
        .select('id')
        .eq('report_id', reportId)
        .eq('user_id', user.id)
        .maybeSingle();
      userHasSigned = !!sig;
    }

    const formattedData = {
      ...data,
      location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
      category: data.category_id,
      categoryName: data.category?.name,
      categoryIcon: data.category?.icon,
      authorName: data.author?.name || 'Anônimo',
      authorAvatar: data.author?.avatar_url,
      photos: (data.report_media || [])
        .filter(m => m.type === 'photo')
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
      videos: (data.report_media || []).filter(m => m.type === 'video'),
      comments: (data.comments || []).filter(c => c.moderation_status === 'approved').map(c => ({
        ...c,
        authorName: c.author?.name || 'Anônimo'
      })),
      upvotes: data.upvotes[0]?.count || 0,
      user_has_upvoted: userHasSigned,
      is_favorited: user ? data.favorite_reports.some(fav => fav.user_id === user.id) : false,
      petitionId: data.petitions?.[0]?.id || null,
      petitionStatus: data.petitions?.[0]?.status || null,
      is_from_water_utility: data.is_from_water_utility,
    };
    setReport(formattedData);
    setLoading(false);
  }, [reportId, navigate, toast, user]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Tentar abrir o app automaticamente se estiver instalado (apenas mobile web)
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !reportId) return;

    // Verificar se é mobile
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isAndroid = /android/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

    if (isAndroid || isIOS) {
      // Prevenir loop infinito se o usuário voltou do app ou se falhar
      const hasTriedOpen = sessionStorage.getItem(`tried_open_app_${reportId}`);
      if (hasTriedOpen) return;
      
      sessionStorage.setItem(`tried_open_app_${reportId}`, 'true');

      const deepLink = `trombonecidadao://bronca/${reportId}`;
      
      // Tentar abrir via iframe (menos intrusivo que window.location)
      const iframe = document.createElement('iframe');
      iframe.style.border = 'none';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.display = 'none';
      
      // Adicionar ao body para tentar disparar o intent
      document.body.appendChild(iframe);
      iframe.src = deepLink;
      
      // Limpeza de segurança
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3000);
    }
  }, [reportId]);

  const handleUpdateReport = async (editData) => {
    const {
      id,
      title,
      description,
      address,
      location,
      category_id,
      newPhotos,
      newVideos,
      removedMedia,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      moderation_status,
      is_from_water_utility,
    } = editData;

    const reportUpdates = {
      title,
      description,
      address,
      category_id,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      moderation_status,
    };

    if (typeof is_from_water_utility !== 'undefined') {
      if (category_id === 'buracos') {
        reportUpdates.is_from_water_utility = !!is_from_water_utility;
      } else {
        reportUpdates.is_from_water_utility = null;
      }
    }
    if (location) {
      reportUpdates.location = `POINT(${location.lng} ${location.lat})`;
    }

    const { error: updateError } = await supabase.from('reports').update(reportUpdates).eq('id', id);
    if (updateError) {
      toast({ title: "Erro ao atualizar dados", description: updateError.message, variant: "destructive" });
      return;
    }

    if (removedMedia && removedMedia.length > 0) {
      const { error: deleteError } = await supabase.from('report_media').delete().in('id', removedMedia);
      if (deleteError) {
        toast({ title: "Erro ao remover mídia antiga", description: deleteError.message, variant: "destructive" });
      }
    }

    const mediaToUpload = [
      ...(newPhotos || []).map(p => ({ ...p, type: 'photo' })),
      ...(newVideos || []).map(v => ({ ...v, type: 'video' }))
    ];

    if (mediaToUpload.length > 0) {
      const uploadPromises = mediaToUpload.map(async (media) => {
        const filePath = `${user.id}/${id}/${Date.now()}-${media.name}`;
        const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, media.file);
        if (uploadError) throw new Error(`Falha no upload de ${media.name}: ${uploadError.message}`);
        const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
        return { report_id: id, url: publicUrl, type: media.type, name: media.name };
      });

      try {
        const uploadedMedia = await Promise.all(uploadPromises);
        if (uploadedMedia.length > 0) {
          const { error: insertError } = await supabase.from('report_media').insert(uploadedMedia);
          if (insertError) throw new Error(`Falha ao salvar mídia: ${insertError.message}`);
        }
      } catch (error) {
        toast({ title: "Erro no upload de nova mídia", description: error.message, variant: "destructive" });
      }
    }
    
    toast({ title: "Bronca atualizada com sucesso! ✨" });
    fetchReport();
  };

  const handleFavoriteToggle = async (reportId, isFavorited) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para favoritar.", variant: "destructive" });
      navigate('/login');
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao desfavoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Removido dos favoritos! 💔" });
        setReport(prev => ({ ...prev, is_favorited: false }));
      }
    } else {
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: reportId });
      if (error) {
        toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Adicionado aos favoritos! ⭐" });
        setReport(prev => ({ ...prev, is_favorited: true }));
      }
    }
  };

  const handleUpvoteFromDetails = async (id, upvotes, userHasUpvoted) => {
    const result = await handleUpvote(id, upvotes, userHasUpvoted);
    if (result.success) {
      setReport((prev) =>
        prev && prev.id === id
          ? {
              ...prev,
              upvotes: result.newUpvotes,
              user_has_upvoted: result.newUserHasUpvoted,
            }
          : prev,
      );
    }
  };

  const handleOpenLinkModal = (sourceReport) => {
    setReportToLink(sourceReport);
    setShowLinkModal(true);
  };

  const handleLinkReport = async (sourceReportId, targetReportId) => {
    const { error } = await supabase
      .from('reports')
      .update({ status: 'duplicate', linked_to: targetReportId })
      .eq('id', sourceReportId);
    
    if (error) {
      toast({ title: "Erro ao vincular bronca", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bronca vinculada! 🔗", description: "A solicitação foi marcada como duplicada." });
      fetchReport();
    }
    setShowLinkModal(false);
    setReportToLink(null);
  };

  const hasMedia = viewerMedia.length > 0;
  const firstMedia = hasMedia ? viewerMedia[0] : null;
  const firstIsVideo =
    firstMedia && (firstMedia.type === 'video' || firstMedia.type === 'video_url');

  const [firstVideoThumb, setFirstVideoThumb] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setFirstVideoThumb(null);
    if (!firstIsVideo || !firstMedia?.url) return;
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      const onLoadedMetadata = () => {
        try {
          // Buscar frame inicial (ou meio, caso 0 cause poster preto)
          const targetTime = Math.min(0.2, Math.max(0.05, (video.duration || 1) * 0.1));
          const onSeeked = () => {
            try {
              const canvas = document.createElement('canvas');
              const vw = video.videoWidth || 1280;
              const vh = video.videoHeight || 720;
              canvas.width = vw;
              canvas.height = vh;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, vw, vh);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              if (!cancelled) setFirstVideoThumb(dataUrl);
            } catch {
              // Fallback silencioso
            }
            video.removeEventListener('seeked', onSeeked);
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          try {
            video.currentTime = targetTime;
          } catch {
            // Alguns navegadores exigem play() antes de seek; tentamos outro caminho
            video.play().then(() => {
              video.pause();
            }).catch(() => {});
          }
        } catch {
          // Fallback silencioso
        }
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      video.src = firstMedia.url;
    } catch {
      // Fallback silencioso
    }
    return () => {
      cancelled = true;
    };
  }, [firstIsVideo, firstMedia?.url]);

  // Sempre renderizar DynamicSEO para garantir que as meta tags estejam presentes
  // Mesmo quando loading ou report é null, para que a thumbnail padrão apareça
  return (
    <>
      {/* Meta Tags Dinâmicas para esta bronca */}
      {/* Usar key única para garantir que o Helmet sobrescreva as meta tags do App.jsx */}
      <DynamicSEO 
        key={`report-page-${report?.id || 'loading'}`}
        title={seoTitle}
        description={seoDescription}
        image={seoImage || `${baseUrl}/images/thumbnail.jpg`}
        url={seoUrl || `${baseUrl}/bronca/${reportId}`}
        type="article"
      />
      
      {loading && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <p>Carregando...</p>
        </div>
      )}

      {!loading && !report && (
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Bronca não encontrada</h1>
          <Button asChild className="mt-4">
            <Link to="/">Voltar para Home</Link>
          </Button>
        </div>
      )}

      {!loading && report && (
        <>
          <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 rounded-xl border-gray-200 bg-[#F4F6F9]"
                  onClick={() => navigate(-1)}
                >
                  <ArrowLeft className="w-4 h-4 text-gray-700" />
                </Button>
                <div className="flex items-center gap-2">
                  {/* <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-sm shadow-[0_2px_6px_rgba(229,62,62,0.45)]">
                    <img src="/logo.png" alt="Logo" />
                  </div> */}
                  <span className="text-sm font-extrabold tracking-tight text-gray-900">
                    Trombone Cidadão
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className={`h-9 w-9 rounded-xl border ${
                    report.is_favorited
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200 bg-[#F4F6F9]'
                  }`}
                  onClick={() => handleFavoriteToggle(report.id, report.is_favorited)}
                >
                  <Star
                    className={`w-4 h-4 ${
                      report.is_favorited ? 'fill-red-500 text-red-500' : 'text-gray-500'
                    }`}
                  />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 rounded-xl border-gray-200 bg-[#F4F6F9]"
                  onClick={handleShare}
                >
                  <Share2 className="w-4 h-4 text-gray-500" />
                </Button>
              </div>
            </div>
            <div className="hidden lg:block border-t border-gray-100">
              <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 py-2 text-[11px] text-gray-500 flex items-center gap-1">
                <Link to="/" className="hover:text-red-500 transition-colors">
                  Início
                </Link>
                <span className="opacity-50">›</span>
                <span className="hover:text-red-500 transition-colors">Broncas</span>
                <span className="opacity-50">›</span>
                <span className="text-gray-700 truncate">{report.title}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#F4F6F9] min-h-screen overflow-x-hidden">
            <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 py-4 lg:py-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_320px]">
              <div>
                  {managementPanel && (
                      <div className="mb-4 lg:hidden">{managementPanel}</div>
                    )}
                <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="relative overflow-hidden">
                    <div className="w-full max-w-full h-56 sm:h-64 bg-slate-900 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] bg-[length:20px_20px]" />
                      {hasMedia ? (
                        <button
                          type="button"
                          className="absolute inset-0 w-full h-full"
                          onClick={() =>
                            setMediaViewerState({
                              isOpen: true,
                              startIndex: 0,
                            })
                          }
                        >
                          {firstIsVideo ? (
                            firstVideoThumb ? (
                              <div className="w-full h-full relative">
                                <img
                                  src={firstVideoThumb}
                                  alt="Thumbnail do vídeo"
                                  className="w-full h-full max-w-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/10" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-12 h-12 rounded-full bg-black/30 border border-white/20 flex items-center justify-center">
                                    <Play className="w-6 h-6 text-white drop-shadow" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                                <Play className="w-10 h-10 text-white drop-shadow" />
                              </div>
                            )
                          ) : (
                            <img
                              src={firstMedia.url}
                              alt="Mídia da bronca"
                              className="w-full h-full max-w-full object-cover"
                            />
                          )}
                        </button>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                            <MapPin className="w-7 h-7 text-white/60" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                      <div className="hidden sm:block absolute top-3 right-3 px-3 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-white/80">
                        {report.protocol || 'Sem protocolo'}
                      </div>
                      <div className="absolute left-4 right-4 bottom-4 flex flex-wrap items-center gap-3 pointer-events-none">
                        <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase bg-white/10 text-white/80 border border-white/20">
                          {getCategoryName(report.category)}
                        </span>
                        <div
                          className={`hidden sm:inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${getStatusInfo(report.status).colorClasses}`}
                        >
                          <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
                          {getStatusInfo(report.status).text}
                        </div>
                        {report.category === 'buracos' && waterUtilityName && (
                          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-300/60 bg-red-500/20 text-[11px] font-medium text-red-50">
                            <Droplet className="w-3.5 h-3.5" />
                            Aberto pela {waterUtilityName}
                          </div>
                        )}
                        {hasMedia && viewerMedia.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMediaViewerState({
                                isOpen: true,
                                startIndex: 0,
                              });
                            }}
                            className="ml-auto px-2.5 py-1.5 rounded-full bg-black/50 border border-white/15 text-[11px] text-white/90 flex items-center gap-1.5 backdrop-blur-sm hover:bg-black/60 transition-colors cursor-pointer pointer-events-auto z-20"
                          >
                            <Image className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Ver todas as mídias ({viewerMedia.length})</span>
                            <span className="sm:hidden">Ver todas ({viewerMedia.length})</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                      <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-gray-900">
                        {report.title}
                      </h1>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Cadastrado em {formatDateTime(report.created_at)}</span>
                        </div>
                        {report.address && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[220px] sm:max-w-xs">
                              {report.address}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-6 space-y-8">
               
                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 shadow-sm lg:hidden">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-1 text-center">
                        Apoios
                      </div>
                      <div className="text-3xl font-extrabold text-gray-900 text-center">
                        {report.upvotes || 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 mb-4 text-center">
                        pessoas apoiaram essa bronca
                      </div>
                      <Button
                        className="w-full justify-center gap-2 text-sm font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                        onClick={handleUpvoteClick}
                      >
                        <ThumbsUp
                          className={`w-4 h-4 ${
                            report.user_has_upvoted ? 'fill-white text-white' : ''
                          }`}
                        />
                        {report.user_has_upvoted ? 'Apoiada' : 'Apoiar essa bronca'}
                      </Button>
                      <Button
                        className="mt-2 w-full justify-center gap-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700"
                        onClick={handleShare}
                      >
                        <Share2 className="w-4 h-4" />
                        Compartilhar bronca
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full mt-2 justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 border-gray-200"
                        onClick={() => handleFavoriteToggle(report.id, report.is_favorited)}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            report.is_favorited ? 'fill-yellow-400 text-yellow-400' : ''
                          }`}
                        />
                        {report.is_favorited ? 'Favoritada' : 'Favoritar'}
                      </Button>
                      {report.petitionId && (
                        <Button
                          asChild
                          className="w-full mt-2 justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Link to={`/abaixo-assinado/${report.petitionId}`}>
                            <FileSignature className="w-4 h-4" />
                            Ver abaixo-assinado ligado
                          </Link>
                        </Button>
                      )}
                    </div>

                    

                    {report.description && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                          <span className="inline-block w-1 h-4 rounded bg-red-500" />
                          Descrição
                        </div>
                        <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                          {report.description}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                        <span className="inline-block w-1 h-4 rounded bg-red-500" />
                        Detalhes
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-3 bg-white  px-3 py-2">
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                              Categoria
                            </div>
                            <div className="text-xs font-medium text-gray-900">
                              {getCategoryName(report.category)}
                            </div>
                          </div>
                        </div>

                        {report.protocol && (
                          <div className="flex items-center gap-3 bg-white  px-3 py-2">
                            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                              <Hash className="w-4 h-4 text-red-600" />
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                                Protocolo
                              </div>
                              <div className="text-[11px] font-mono text-gray-900 break-all">
                                {report.protocol}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3 bg-white  px-3 py-2">
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                              Cadastrado em
                            </div>
                            <div className="text-xs text-gray-900">
                              {formatDateTime(report.created_at)}
                            </div>
                          </div>
                        </div>

                        {report.address && (
                          <div className="flex items-center gap-3 bg-white  px-3 py-2">
                            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                              <MapPin className="w-4 h-4 text-red-600" />
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                                Localização
                              </div>
                              <div className="text-xs text-gray-900">
                                {report.address}
                              </div>
                            </div>
                          </div>
                        )}

                       { report.category === 'buracos' && <div className="flex items-center gap-3 bg-white  px-3 py-2">
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                            <Droplet className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                              Aberto pela COMPESA?
                            </div>
                            <div className="text-xs text-gray-900">
                              {isFromWaterUtility ? 'Sim' : 'Não'}
                            </div>
                          </div>
                        </div>}

                        <div className="flex items-center gap-3 bg-white  px-3 py-2">
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                            <Flag className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                              Status
                            </div>
                            <div className="text-xs text-gray-900">
                              {getStatusInfo(report.status).text}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {report.timeline && report.timeline.length > 0 && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                          <span className="inline-block w-1 h-4 rounded bg-red-500" />
                          Linha do Tempo
                        </div>
                        <div className="relative pl-4">
                          <div className="absolute left-1 top-1 bottom-1 w-px bg-gray-200" />
                          <div className="space-y-4">
                            {report.timeline.map((item) => (
                              <div key={item.id} className="relative flex gap-3">
                                <div className="mt-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow ring-2 ring-red-500" />
                                <div>
                                  <div className="text-[11px] text-gray-500">
                                    {formatDateTime(item.date)}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {item.description}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {(user?.is_admin || user?.user_type === 'public_official') && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="justify-center gap-2 text-sm"
                            onClick={handleShare}
                          >
                            <Share2 className="w-4 h-4" />
                            Compartilhar
                          </Button>
                          <Button
                            variant="outline"
                            className="justify-center gap-2 text-sm"
                            onClick={handleEditClick}
                          >
                            <Edit className="w-4 h-4" />
                            Editar
                          </Button>
                          <Button
                            className="justify-center gap-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-white"
                            onClick={handleMarkResolvedClick}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Marcar Resolvido
                          </Button>
                          <Button
                            variant="outline"
                            className="justify-center gap-2 text-sm"
                            onClick={() => handleOpenLinkModal(report)}
                          >
                            <LinkIcon className="w-4 h-4" />
                            Vincular
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={handleReportError}
                          className="inline-flex items-center gap-2 text-[11px] text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <Flag className="w-4 h-4" />
                          Reportar um erro nesta bronca
                        </button>
                      </div>
                    )}

                    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <h2 className="text-sm font-semibold text-gray-900">Comentários</h2>
                        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-500">
                          {comments.length}
                        </span>
                      </div>
                      <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                        {comments.length > 0 ? (
                          comments.map((comment) => (
                            <div key={comment.id} className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                                {(comment.authorName || comment.author?.name || '?')
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <p className="text-xs font-semibold text-gray-900 truncate">
                                    {comment.authorName || comment.author?.name || 'Anônimo'}
                                  </p>
                                  <p className="text-[10px] text-gray-400 flex-shrink-0">
                                    {formatDateTime(comment.created_at)}
                                  </p>
                                </div>
                                <p className="text-xs text-gray-700 break-words">
                                  {comment.text}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500 text-center py-4">
                            Nenhum comentário aprovado ainda.
                          </p>
                        )}
                      </div>
                      {user ? (
                        <form
                          onSubmit={handleSubmitComment}
                          className="mt-4 flex gap-2 items-center"
                        >
                          <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Adicione seu comentário..."
                            className="flex-1 text-xs sm:text-sm bg-white px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                          />
                          <Button type="submit" size="icon" className="flex-shrink-0">
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        </form>
                      ) : (
                        <div className="mt-4 text-center px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600">
                          <Link to="/login" className="font-semibold text-red-600 hover:underline">
                            Faça login
                          </Link>{' '}
                          ou{' '}
                          <Link
                            to="/cadastro"
                            className="font-semibold text-red-600 hover:underline"
                          >
                            cadastre-se
                          </Link>{' '}
                          para comentar e acompanhar esta bronca.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-6 text-center hidden lg:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-1">
                    Apoios
                  </div>
                  <div className="text-4xl font-extrabold text-gray-900">
                    {report.upvotes || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 mb-4">
                    pessoas apoiaram essa bronca
                  </div>
                  <Button
                    className="w-full justify-center gap-2 text-sm font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                    onClick={handleUpvoteClick}
                  >
                    <ThumbsUp
                      className={`w-4 h-4 ${
                        report.user_has_upvoted ? 'fill-white text-white' : ''
                      }`}
                    />
                    {report.user_has_upvoted ? 'Apoiada' : 'Apoiar essa bronca'}
                  </Button>
                  <Button
                    className="mt-2 w-full justify-center gap-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700"
                    onClick={handleShare}
                  >
                    <Share2 className="w-4 h-4" />
                    Compartilhar bronca
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full mt-2 justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 border-gray-200"
                    onClick={() => handleFavoriteToggle(report.id, report.is_favorited)}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        report.is_favorited ? 'fill-yellow-400 text-yellow-400' : ''
                      }`}
                    />
                    {report.is_favorited ? 'Favoritada' : 'Favoritar'}
                  </Button>
                  {report.petitionId && (
                    <Button
                      asChild
                      className="w-full mt-2 justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Link to={`/abaixo-assinado/${report.petitionId}`}>
                        <FileSignature className="w-4 h-4" />
                        Ver abaixo-assinado ligado
                      </Link>
                    </Button>
                  )}
                </div>

                {managementPanel && (
                  <div className="hidden lg:block">{managementPanel}</div>
                )}

      

              </aside>
            </div>
          </div>

          {showDonationModal && (
            <DonationModal
              report={report}
              isOpen={showDonationModal}
              onClose={() => setShowDonationModal(false)}
            />
          )}

          {mediaViewerState.isOpen && viewerMedia.length > 0 && (
            <MediaViewer
              media={viewerMedia}
              startIndex={mediaViewerState.startIndex}
              onClose={() =>
                setMediaViewerState({
                  isOpen: false,
                  startIndex: 0,
                })
              }
            />
          )}

          {showEditDetails && report && (
            <ReportDetails
              report={report}
              onClose={() => setShowEditDetails(false)}
              onUpdate={handleUpdateReport}
              onUpvote={handleUpvoteFromDetails}
              onLink={handleOpenLinkModal}
              onFavoriteToggle={handleFavoriteToggle}
              onDonate={() => setShowDonationModal(true)}
              startInEdit={true}
            />
          )}

          {showMarkResolvedModal && (
            <MarkResolvedModal
              onClose={() => setShowMarkResolvedModal(false)}
              onSubmit={handleConfirmResolution}
            />
          )}

          {showLinkModal && reportToLink && (
            <LinkReportModal
              sourceReport={reportToLink}
              allReports={allReports}
              onClose={() => setShowLinkModal(false)}
              onLink={handleLinkReport}
            />
          )}
        </>
      )}
    </>
  );
};

export default ReportPage;
