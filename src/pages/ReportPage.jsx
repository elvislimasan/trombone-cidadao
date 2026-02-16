import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReportDetails from '@/components/ReportDetails';
import { Capacitor } from '@capacitor/core';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import LinkReportModal from '@/components/LinkReportModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useUpvote } from '../hooks/useUpvotes';
import DynamicSEO from '../components/DynamicSeo';
import DonationModal from '@/components/DonationModal';

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
  const [reportToLink, setReportToLink] = useState(null);
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
        petitionStatus: data.petitions?.[0]?.status || null
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
    const { id, title, description, address, location, category_id, newPhotos, newVideos, removedMedia, status, is_recurrent, evaluation, resolution_submission, moderation_status } = editData;

    const reportUpdates = { title, description, address, category_id, status, is_recurrent, evaluation, resolution_submission , moderation_status};
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
      <ReportDetails
        report={report}
        onClose={() => navigate('/')}
        onUpdate={handleUpdateReport}
        onUpvote={() => handleUpvote(report.id)}
        onLink={handleOpenLinkModal}
        onFavoriteToggle={handleFavoriteToggle}
        onDonate={() => setShowDonationModal(true)}
      />
      
      {showDonationModal && (
        <DonationModal
          report={report}
          isOpen={showDonationModal}
          onClose={() => setShowDonationModal(false)}
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
