import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { getReportShareUrl } from '@/lib/shareUtils';
import { useUpvote } from '../hooks/useUpvotes';
import DynamicSEO from '../components/DynamicSeo';
import DonationModal from '@/components/DonationModal';
import MarkResolvedModal from '@/components/MarkResolvedModal';
import MediaViewer from '@/components/MediaViewer';
import { Combobox } from '@/components/ui/combobox';
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
  Instagram,
  Sparkles,
  Heart,
  FileText,
  X,
  Download,
  User2Icon,
  Megaphone,
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { toPng } from 'html-to-image';
import ReportFlyerModal from '@/components/report/ReportFlyerModal';
import ReportStoryModal from '@/components/report/ReportStoryModal';
import { AlertCircle, Layout as LayoutIcon, Grid as GridIcon, Home } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FLORESTA_COORDS } from '@/config/mapConfig';

// Fix for Leaflet default icon
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const ReportMap = ({ location, address }) => {
  const position = useMemo(() => {
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      return [location.lat, location.lng];
    }
    return FLORESTA_COORDS;
  }, [location]);

  return (
    <div className="h-48 w-full rounded-2xl overflow-hidden relative z-0 border border-gray-100 shadow-sm">
      <MapContainer 
        center={position} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            {address || 'Localização da Bronca'}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main ReportPage
// ─────────────────────────────────────────────
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
  const [showFlyerModal, setShowFlyerModal] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [mediaViewerState, setMediaViewerState] = useState({ isOpen: false, startIndex: 0 });
  const [showEditDetails, setShowEditDetails] = useState(false);
  const { handleUpvote } = useUpvote();

  const qrCodeUrl = useMemo(() => {
    if (!reportId) return '';
    const url = getReportShareUrl(reportId);
    return `https://api.qrserver.com/v1/create-qr-code/?size=380x380&data=${encodeURIComponent(url)}`;
  }, [reportId]);

  const getBaseUrl = useCallback(() => {
    let baseUrl;
    if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    } else if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    } else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('localhost')) baseUrl = origin;
      else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) baseUrl = origin;
      else if (origin.includes('trombonecidadao.com.br')) baseUrl = 'https://trombonecidadao.com.br';
      else baseUrl = origin;
    } else {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    return baseUrl.replace(/\/$/, '');
  }, []);

  const baseUrl = useMemo(() => getBaseUrl(), [getBaseUrl]);

  const reportPhotos = useMemo(() => {
    if (!report || !report.photos) return [];
    return Array.isArray(report.photos) ? report.photos : [];
  }, [report?.photos]);

  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    let reportImage = defaultThumbnail;
    if (reportPhotos && reportPhotos.length > 0) {
      const firstPhoto = reportPhotos[0];
      if (firstPhoto) {
        const imageUrl = firstPhoto.url || firstPhoto.publicUrl || firstPhoto.photo_url || firstPhoto.image_url;
        if (imageUrl) {
          if (imageUrl.startsWith('http')) reportImage = imageUrl;
          else reportImage = `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
          try {
            const cleanUrl = reportImage.split('?')[0];
            reportImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=600&h=315&fit=cover&q=60&output=jpg`;
          } catch (e) { console.error(e); }
        }
      }
    }
    if (!reportImage || reportImage.trim() === '') reportImage = defaultThumbnail;
    const reportTitle = report?.title || '';
    const reportDescription = report?.description || '';
    const reportProtocol = report?.protocol || '';
    const currentReportId = report?.id || reportId || '';
    return {
      title: reportTitle ? `Bronca: ${reportTitle} - Trombone Cidadão` : 'Trombone Cidadão',
      description: reportDescription || `Confira esta solicitação em Floresta-PE: "${reportTitle}". Protocolo: ${reportProtocol}`,
      image: reportImage,
      url: `${baseUrl}/bronca/${currentReportId}`,
    };
  }, [baseUrl, report?.title, report?.description, report?.protocol, report?.id, reportId, reportPhotos]);

  const seoTitle = seoData.title;
  const seoDescription = seoData.description;
  const seoImage = seoData.image;
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
      return new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const comments = useMemo(() => (Array.isArray(report?.comments) ? report.comments : []), [report?.comments]);

  const mediaItems = useMemo(() => {
    if (!report) return [];
    const photos = Array.isArray(report.photos) ? report.photos : [];
    const videos = Array.isArray(report.videos) ? report.videos : [];
    return [...photos, ...videos];
  }, [report?.photos, report?.videos]);

  const viewerMedia = useMemo(() =>
    mediaItems.map((item, index) => {
      const url = item.url || item.publicUrl || item.photo_url || item.image_url || item.video_url;
      if (!url) return null;
      const type = item.type === 'video' || item.type === 'video_url' ? 'video' : 'image';
      return { ...item, url, type, _index: index };
    }).filter(Boolean),
  [mediaItems]);

  const waterUtilityName = useMemo(() => {
    if (!report || !report.is_from_water_utility) return null;
    const address = (report.address || '').toLowerCase();
    const locationText = (report.categoryName || '').toLowerCase();
    const hasPernambucoText = address.includes('pernambuco') || address.includes('-pe') || address.endsWith(' pe') || locationText.includes('pernambuco');
    let isPernambucoByCoordinates = false;
    if (report.location && typeof report.location.lat === 'number' && typeof report.location.lng === 'number') {
      const { lat, lng } = report.location;
      isPernambucoByCoordinates = lat >= -9.8 && lat <= -7.2 && lng >= -41.5 && lng <= -34.8;
    }
    return (hasPernambucoText || isPernambucoByCoordinates) ? 'COMPESA' : 'companhia de abastecimento de água/esgoto';
  }, [report]);

  const isFromWaterUtility = !!report?.is_from_water_utility;
  const canChangeStatus = !!user && !!report && (user.is_admin || user.user_type === 'public_official');
  const canEditCategory = !!user && !!report && user.is_admin;
  const canManageWaterUtility = !!report && report.category === 'buracos' && canEditCategory;

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!user) { toast({ title: 'Acesso restrito', description: 'Você precisa fazer login para comentar.', variant: 'destructive' }); navigate('/login'); return; }
    if (!newComment.trim() || !report) return;
    const { error } = await supabase.from('comments').insert({ report_id: report.id, author_id: user.id, text: newComment, moderation_status: 'pending_approval' });
    if (error) toast({ title: 'Erro ao enviar comentário', description: error.message, variant: 'destructive' });
    else { setNewComment(''); toast({ title: 'Comentário enviado! 💬', description: 'Seu comentário foi enviado para moderação e será publicado em breve.' }); fetchReport(); }
  };

  const handleReportError = () => toast({ title: 'Reportar erro', description: 'Obrigado por avisar. Vamos analisar esta bronca.' });

  const handleShare = async () => {
    if (!report) return;
    const shareUrl = seoUrl || `${baseUrl}/bronca/${report.id}`;
    const title = report.title ? `Trombone Cidadão: ${report.title}` : 'Trombone Cidadão';
    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
        await Share.share({ title, url: shareUrl });
        toast({ title: 'Compartilhado com sucesso! 📣' }); return;
      }
      if (navigator.share) { await navigator.share({ title, url: shareUrl }); toast({ title: 'Compartilhado com sucesso! 📣' }); return; }
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copiado!', description: 'Cole nas suas redes sociais.' });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copiado!' }); }
      catch { toast({ title: 'Erro ao compartilhar', variant: 'destructive' }); }
    }
  };

  const handleCopyShareLink = () => {
    if (!report) return;
    const shareUrl = seoUrl || `${baseUrl}/bronca/${report.id}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => toast({ title: 'Link copiado!', description: 'Cole nas suas redes sociais.' }))
      .catch(() => toast({ title: 'Erro ao copiar link', variant: 'destructive' }));
  };

  // ── STORY CARD – all inline styles, zero Tailwind ──
  const handleDownloadStoryCard = async () => {
    // This function is now handled by ReportStoryModal component
    setShowStoryModal(true);
  };

  const handleAdminStatusChange = async (newStatus) => {
    if (!report || !canChangeStatus) return;
    const { error } = await supabase.from('reports').update({ status: newStatus }).eq('id', report.id);
    if (error) { toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' }); return; }
    setReport(prev => (prev ? { ...prev, status: newStatus } : prev));
    toast({ title: 'Status atualizado', description: `A bronca agora está como "${getStatusInfo(newStatus).text}".` });
  };

  const handleAdminCategoryChange = async (newCategory) => {
    if (!report || !canEditCategory) return;
    const updates = { category_id: newCategory };
    if (newCategory !== 'buracos') updates.is_from_water_utility = null;
    const { error } = await supabase.from('reports').update(updates).eq('id', report.id);
    if (error) { toast({ title: 'Erro ao atualizar categoria', description: error.message, variant: 'destructive' }); return; }
    setReport(prev => prev ? { ...prev, category: newCategory, is_from_water_utility: newCategory === 'buracos' ? prev.is_from_water_utility : null } : prev);
    toast({ title: 'Categoria atualizada' });
  };

  const handleAdminWaterUtilityChange = async (value) => {
    if (!report || !canManageWaterUtility) return;
    const isYes = value === 'yes';
    const { error } = await supabase.from('reports').update({ is_from_water_utility: isYes }).eq('id', report.id);
    if (error) { toast({ title: 'Erro ao atualizar informação', description: error.message, variant: 'destructive' }); return; }
    setReport(prev => prev ? { ...prev, is_from_water_utility: isYes } : prev);
    toast({ title: 'Informação atualizada' });
  };

  const handleUpvoteClick = async () => {
    if (!report) return;
    const result = await handleUpvote(report.id, report.upvotes, report.user_has_upvoted);
    if (result.success) setReport(prev => prev ? { ...prev, upvotes: result.newUpvotes, user_has_upvoted: result.newUserHasUpvoted } : prev);
  };

  const handleEditClick = () => {
    if (!report) return;
    if (!user) { toast({ title: 'Acesso restrito', description: 'Você precisa fazer login para editar broncas.', variant: 'destructive' }); navigate('/login'); return; }
    if (!(user.is_admin || user.user_type === 'public_official')) { toast({ title: 'Acesso restrito', description: 'Somente gestores podem editar esta bronca.', variant: 'destructive' }); return; }
    setShowEditDetails(true);
  };

  const handleMarkResolvedClick = () => {
    if (!report) return;
    if (!user) { toast({ title: 'Acesso restrito', variant: 'destructive' }); navigate('/login'); return; }
    if (!(user.is_admin || user.user_type === 'public_official')) { toast({ title: 'Acesso restrito', variant: 'destructive' }); return; }
    setShowMarkResolvedModal(true);
  };

  const handleConfirmResolution = async (resolutionData) => {
    if (!report || !user) return;
    const { photoFile } = resolutionData;
    let publicURLData = { publicUrl: null };
    if (photoFile) {
      let uploadFile = photoFile;
      try {
        const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(photoFile); });
        const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = dataUrl; });
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
        uploadFile = new File([blob], (photoFile.name || 'resolution').replace(/\.(jpe?g|png)$/i, '.webp'), { type: 'image/webp' });
      } catch (_) {}
      const filePath = `${user.id}/${report.id}/resolution-${Date.now()}`;
      const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, uploadFile);
      if (uploadError) { toast({ title: 'Erro no upload da foto', description: uploadError.message, variant: 'destructive' }); return; }
      const { data } = supabase.storage.from('reports-media').getPublicUrl(filePath);
      publicURLData = data;
    }
    const isAdmin = user && user.is_admin;
    const updatedReport = {
      status: isAdmin ? 'resolved' : 'pending_resolution',
      resolution_submission: { photoUrl: publicURLData.publicUrl, userId: user.id, userName: user.name, submittedAt: new Date().toISOString() },
      ...(isAdmin && { resolved_at: new Date().toISOString() }),
    };
    const { error } = await supabase.from('reports').update(updatedReport).eq('id', report.id);
    if (error) { toast({ title: 'Erro ao atualizar bronca', description: error.message, variant: 'destructive' }); return; }
    setReport(prev => (prev ? { ...prev, ...updatedReport } : prev));
    setShowMarkResolvedModal(false);
    toast({ title: 'Bronca atualizada', description: isAdmin ? 'Bronca marcada como resolvida.' : 'Resolução enviada para revisão.' });
  };

  const managementPanel = canChangeStatus && report?.moderation_status === 'approved' ? (
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">Alterar Status</div>
              <Combobox
                options={[
                  { value: 'pending', label: 'Pendente' },
                  { value: 'in-progress', label: 'Em Andamento' },
                  { value: 'pending_resolution', label: 'Verificando Resolução' },
                  ...(user?.is_admin ? [{ value: 'resolved', label: 'Resolvido' }] : [])
                ]}
                value={report.status} onChange={handleAdminStatusChange}
                placeholder="Selecione o status" searchPlaceholder="Buscar status..." notFoundText="Status não encontrado"
              />
            </div>
            {canEditCategory && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">Alterar Categoria</div>
                <Combobox
                  options={Object.entries(categories).map(([key, value]) => ({ value: key, label: value }))}
                  value={report.category} onChange={handleAdminCategoryChange}
                  placeholder="Selecione a categoria" searchPlaceholder="Buscar categoria..." notFoundText="Categoria não encontrada"
                />
              </div>
            )}
            {canManageWaterUtility && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">Aberto pela COMPESA?</div>
                <Combobox
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={isFromWaterUtility ? 'yes' : 'no'} onChange={handleAdminWaterUtilityChange}
                  placeholder="Selecione" searchPlaceholder="Buscar..." notFoundText="Opção não encontrada"
                />
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ) : null;

  useEffect(() => {
    const imageToUse = seoImage || `${baseUrl}/images/thumbnail.jpg`;
    if (!imageToUse) return;
    const updateMetaTags = () => {
      ['meta[property="og:image"]','meta[property="og:image:url"]','meta[property="og:image:width"]','meta[property="og:image:height"]','meta[property="og:image:type"]','meta[property="og:image:alt"]','meta[name="twitter:image"]','meta[name="twitter:image:alt"]','meta[name="image"]','link[rel="image_src"]']
        .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
      [
        { k: 'property', v: 'og:image', c: imageToUse },
        { k: 'property', v: 'og:image:url', c: imageToUse },
        { k: 'property', v: 'og:image:width', c: '1200' },
        { k: 'property', v: 'og:image:height', c: '630' },
        { k: 'property', v: 'og:image:type', c: 'image/jpeg' },
        { k: 'property', v: 'og:image:alt', c: seoTitle || 'Trombone Cidadão' },
        { k: 'name', v: 'twitter:image', c: imageToUse },
        { k: 'name', v: 'twitter:image:alt', c: seoTitle || 'Trombone Cidadão' },
        { k: 'name', v: 'image', c: imageToUse },
      ].forEach(({ k, v, c }) => {
        const el = document.createElement('meta');
        el.setAttribute(k, v); el.setAttribute('content', c);
        document.head.insertBefore(el, document.head.firstChild);
      });
      const link = document.createElement('link');
      link.setAttribute('rel', 'image_src'); link.setAttribute('href', imageToUse);
      document.head.insertBefore(link, document.head.firstChild);
    };
    updateMetaTags();
    const timers = [setTimeout(updateMetaTags, 100), setTimeout(updateMetaTags, 500), setTimeout(updateMetaTags, 1000)];
    return () => timers.forEach(clearTimeout);
  }, [report?.id, reportPhotos, seoImage, seoTitle, baseUrl]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try { if (reportId) await supabase.rpc('increment_views', { table_name: 'reports', item_id: reportId }); }
    catch (e) { console.error(e); }
    const { data, error } = await supabase
      .from('reports')
      .select('*, pole_number, category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), timeline:report_timeline(*), report_media(*), upvotes:signatures(count), favorite_reports(user_id), petitions(id, status)')
      .eq('id', reportId)
      .single();
    if (error || !data) {
      setLoading(false);
      toast({ title: 'Bronca não encontrada', description: 'A solicitação que você está procurando não existe ou foi removida.', variant: 'destructive' });
      setTimeout(() => navigate('/'), 0);
      return;
    }
    let userHasSigned = false;
    if (user) {
      const { data: sig } = await supabase.from('signatures').select('id').eq('report_id', reportId).eq('user_id', user.id).maybeSingle();
      userHasSigned = !!sig;
    }
    setReport({
      ...data,
      location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
      category: data.category_id,
      categoryName: data.category?.name,
      categoryIcon: data.category?.icon,
      authorName: data.author?.name || 'Anônimo',
      authorAvatar: data.author?.avatar_url,
      photos: (data.report_media || []).filter(m => m.type === 'photo').sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)),
      videos: (data.report_media || []).filter(m => m.type === 'video'),
      comments: (data.comments || []).filter(c => c.moderation_status === 'approved').map(c => ({ ...c, authorName: c.author?.name || 'Anônimo' })),
      upvotes: data.upvotes[0]?.count || 0,
      user_has_upvoted: userHasSigned,
      is_favorited: user ? data.favorite_reports.some(fav => fav.user_id === user.id) : false,
      petitionId: data.petitions?.[0]?.id || null,
      petitionStatus: data.petitions?.[0]?.status || null,
      is_from_water_utility: data.is_from_water_utility,
    });
    setLoading(false);
  }, [reportId, navigate, toast, user]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !reportId) return;
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isMobile = /android/i.test(ua) || (/iPad|iPhone|iPod/.test(ua) && !window.MSStream);
    if (isMobile) {
      if (sessionStorage.getItem(`tried_open_app_${reportId}`)) return;
      sessionStorage.setItem(`tried_open_app_${reportId}`, 'true');
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, { border: 'none', width: '1px', height: '1px', display: 'none' });
      document.body.appendChild(iframe);
      iframe.src = `trombonecidadao://bronca/${reportId}`;
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
    }
  }, [reportId]);

  const handleUpdateReport = async (editData) => {
    const { id, title, description, address, location, category_id, newPhotos, newVideos, removedMedia, status, is_recurrent, evaluation, resolution_submission, moderation_status, is_from_water_utility } = editData;
    const reportUpdates = { title, description, address, category_id, status, is_recurrent, evaluation, resolution_submission, moderation_status };
    if (typeof is_from_water_utility !== 'undefined') reportUpdates.is_from_water_utility = category_id === 'buracos' ? !!is_from_water_utility : null;
    if (location) reportUpdates.location = `POINT(${location.lng} ${location.lat})`;
    const { error: updateError } = await supabase.from('reports').update(reportUpdates).eq('id', id);
    if (updateError) { toast({ title: 'Erro ao atualizar dados', description: updateError.message, variant: 'destructive' }); return; }
    if (removedMedia?.length) {
      await supabase.from('report_media').delete().in('id', removedMedia);
    }
    const mediaToUpload = [...(newPhotos || []).map(p => ({ ...p, type: 'photo' })), ...(newVideos || []).map(v => ({ ...v, type: 'video' }))];
    if (mediaToUpload.length > 0) {
      try {
        const uploaded = await Promise.all(mediaToUpload.map(async media => {
          const filePath = `${user.id}/${id}/${Date.now()}-${media.name}`;
          const { error: ue } = await supabase.storage.from('reports-media').upload(filePath, media.file);
          if (ue) throw new Error(ue.message);
          const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
          return { report_id: id, url: publicUrl, type: media.type, name: media.name };
        }));
        await supabase.from('report_media').insert(uploaded);
      } catch (err) { toast({ title: 'Erro no upload de nova mídia', description: err.message, variant: 'destructive' }); }
    }
    toast({ title: 'Bronca atualizada com sucesso! ✨' });
    fetchReport();
  };

  const handleFavoriteToggle = async (rId, isFav) => {
    if (!user) { toast({ title: 'Acesso restrito', variant: 'destructive' }); navigate('/login'); return; }
    if (isFav) {
      const { error } = await supabase.from('favorite_reports').delete().match({ user_id: user.id, report_id: rId });
      if (error) toast({ title: 'Erro ao desfavoritar', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Removido dos favoritos! 💔' }); setReport(prev => ({ ...prev, is_favorited: false })); }
    } else {
      const { error } = await supabase.from('favorite_reports').insert({ user_id: user.id, report_id: rId });
      if (error) toast({ title: 'Erro ao favoritar', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Adicionado aos favoritos! ⭐' }); setReport(prev => ({ ...prev, is_favorited: true })); }
    }
  };

  const handleUpvoteFromDetails = async (id, upvotes, userHasUpvoted) => {
    const result = await handleUpvote(id, upvotes, userHasUpvoted);
    if (result.success) setReport(prev => prev && prev.id === id ? { ...prev, upvotes: result.newUpvotes, user_has_upvoted: result.newUserHasUpvoted } : prev);
  };

  const handleOpenLinkModal = (sourceReport) => { setReportToLink(sourceReport); setShowLinkModal(true); };
  const handleLinkReport = async (sourceReportId, targetReportId) => {
    const { error } = await supabase.from('reports').update({ status: 'duplicate', linked_to: targetReportId }).eq('id', sourceReportId);
    if (error) toast({ title: 'Erro ao vincular bronca', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Bronca vinculada! 🔗' }); fetchReport(); }
    setShowLinkModal(false); setReportToLink(null);
  };

  const hasMedia = viewerMedia.length > 0;
  const firstMedia = hasMedia ? viewerMedia[0] : null;
  const firstIsVideo = firstMedia && (firstMedia.type === 'video' || firstMedia.type === 'video_url');
  const [firstVideoThumb, setFirstVideoThumb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFirstVideoThumb(null);
    if (!firstIsVideo || !firstMedia?.url) return;
    try {
      const video = document.createElement('video');
      Object.assign(video, { crossOrigin: 'anonymous', muted: true, playsInline: true, preload: 'metadata' });
      video.addEventListener('loadedmetadata', () => {
        const t = Math.min(0.2, Math.max(0.05, (video.duration || 1) * 0.1));
        video.addEventListener('seeked', () => {
          try {
            const c = document.createElement('canvas');
            c.width = video.videoWidth || 1280; c.height = video.videoHeight || 720;
            c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
            if (!cancelled) setFirstVideoThumb(c.toDataURL('image/jpeg', 0.7));
          } catch {}
        }, { once: true });
        try { video.currentTime = t; } catch {}
      }, { once: true });
      video.src = firstMedia.url;
    } catch {}
    return () => { cancelled = true; };
  }, [firstIsVideo, firstMedia?.url]);

  // First photo URL for story card cover
  const coverPhotoUrl = useMemo(() => {
    if (!reportPhotos.length) return null;
    const p = reportPhotos[0];
    return p.url || p.publicUrl || p.photo_url || p.image_url || null;
  }, [reportPhotos]);

  return (
    <>
      <DynamicSEO
        key={`report-page-${report?.id || 'loading'}`}
        title={seoTitle} description={seoDescription}
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
          <Button asChild className="mt-4"><Link to="/">Voltar para Home</Link></Button>
        </div>
      )}

      {!loading && report && (
        <>
          {/* ── TOP NAV ── */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 h-14 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl border-gray-200 bg-[#F4F6F9]" onClick={() => navigate(-1)}>
                  <ArrowLeft className="w-4 h-4 text-gray-700" />
                </Button>
                <span className="text-sm font-extrabold tracking-tight text-gray-900">Voltar para página inicial</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline"
                  className={`h-9 w-9 rounded-xl border ${report.is_favorited ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-[#F4F6F9]'}`}
                  onClick={() => handleFavoriteToggle(report.id, report.is_favorited)}>
                  <Star className={`w-4 h-4 ${report.is_favorited ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
                </Button>
                <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl border-gray-200 bg-[#F4F6F9]" onClick={handleShare}>
                  <Share2 className="w-4 h-4 text-gray-500" />
                </Button>
              </div>
            </div>
            <div className="hidden lg:block border-t border-gray-100">
              <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 py-2 text-[11px] text-gray-500 flex items-center gap-1">
                <Link to="/" className="hover:text-red-500 transition-colors">Início</Link>
                <span className="opacity-50">›</span>
                <span>Broncas</span>
                <span className="opacity-50">›</span>
                <span className="text-gray-700 truncate">{report.title}</span>
              </div>
            </div>
          </div>

          {/* ── PAGE ── */}
          <div className="bg-[#F4F6F9] min-h-screen overflow-x-hidden">
            <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 py-4 lg:py-8 grid gap-8 grid-cols-1 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {managementPanel && <div className="mb-4 lg:hidden">{managementPanel}</div>}
                <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">

                  {/* Título primeiro (mobile) */}
                  <div className="px-6 pt-5 pb-4 border-b border-gray-100 lg:hidden">
                    <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-gray-900">{report.title}</h1>
                       <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span>Cadastrado em {formatDateTime(report.created_at)}</span></div>
                    </div>
                  </div>

                  {/* media hero */}
                  <div className="relative overflow-hidden px-6">
                       {/* Título para desktop (mantido no lugar original) */}
                    <div className="hidden lg:block  pt-5 pb-4 border-b border-gray-100">
                      <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-gray-900">{report.title}</h1>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span>Cadastrado em {formatDateTime(report.created_at)}</span></div>
                        
                        
                      </div>
                    </div>
                    <div className="w-full max-w-full h-56 sm:h-64 bg-slate-900 relative overflow-hidden ">
                      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] bg-[length:20px_20px]" />
                      {hasMedia ? (
                        <button type="button" className="absolute inset-0 w-full h-full " onClick={() => setMediaViewerState({ isOpen: true, startIndex: 0 })}>
                          {firstIsVideo ? (
                            firstVideoThumb ? (
                              <div className="w-full h-full relative">
                                <img src={firstVideoThumb} alt="Thumbnail do vídeo" className="w-full h-full max-w-full object-cover" />
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
                            <img src={firstMedia.url} alt="Mídia da bronca" className="w-full h-full max-w-full object-cover" />
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
                        <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase bg-white/10 text-white/80 border border-white/20">{getCategoryName(report.category)}</span>
                        <div className={`hidden sm:inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${getStatusInfo(report.status).colorClasses}`}>
                          <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
                          {getStatusInfo(report.status).text}
                        </div>
                        {report.category === 'buracos' && waterUtilityName && (
                          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-300/60 bg-red-500/20 text-[11px] font-medium text-red-50">
                            <Droplet className="w-3.5 h-3.5" />Aberto pela {waterUtilityName}
                          </div>
                        )}
                        {hasMedia && viewerMedia.length > 1 && (
                          <button type="button" onClick={e => { e.stopPropagation(); setMediaViewerState({ isOpen: true, startIndex: 0 }); }}
                            className="ml-auto px-2.5 py-1.5 rounded-full bg-black/50 border border-white/15 text-[11px] text-white/90 flex items-center gap-1.5 backdrop-blur-sm hover:bg-black/60 transition-colors cursor-pointer pointer-events-auto z-20">
                            <Image className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Ver todas as mídias ({viewerMedia.length})</span>
                            <span className="sm:hidden">Ver todas ({viewerMedia.length})</span>
                          </button>
                        )}
                     
                      </div>
                      
                    </div>

                 
                  </div>

                  <div className="px-6 py-6 space-y-8">

                    {/* description */}
                    {report.description && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                          <span className="inline-block w-1 h-4 rounded bg-red-500" />Descrição
                        </div>
                        <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">{report.description}</p>
                      </div>
                    )}

                    {/* Map Section (Mobile Only) - Mapa com endereço integrado */}
                    <div className="lg:hidden space-y-4">
                      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100">
                          <h3 className="font-bold text-gray-900 flex items-center">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-red-50 to-orange-50 text-red-600 mr-3 shadow-sm border border-red-100/50">
                              <MapPin className="w-4 h-4" />
                            </div>
                            Localização
                          </h3>
                          
                        </div>
                        <div className="h-48">
                          <ReportMap location={report.location} address={report.address} />
                        </div>
                        {report.address && (
                            <div className="mt-2 flex items-start gap-2 p-2">
                              <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-slate-700 leading-tight">{report.address}</p>
                              </div>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                        <span className="inline-block w-1 h-4 rounded bg-red-500" />Detalhes
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                        {[
                          { icon: <MapPin className="w-4 h-4 text-red-600" />, label: 'Categoria', value: getCategoryName(report.category) },
                          report.protocol && { icon: <Hash className="w-4 h-4 text-red-600" />, label: 'Protocolo', value: <span className="text-[11px] font-mono text-gray-900 break-all">{report.protocol}</span> },
                          { icon: <Calendar className="w-4 h-4 text-red-600" />, label: 'Cadastrado em', value: formatDateTime(report.created_at) },
                          // Removido endereço daqui para evitar redundância (já aparece no título e no mapa)
                          report.category === 'buracos' && { icon: <Droplet className="w-4 h-4 text-red-600" />, label: 'Aberto pela COMPESA?', value: isFromWaterUtility ? 'Sim' : 'Não' },
                          { icon: <Flag className="w-4 h-4 text-red-600" />, label: 'Status', value: getStatusInfo(report.status).text },
                        ].filter(Boolean).map((item, i) => (
                          <div key={i} className="flex items-center gap-3 bg-white px-3 py-2">
                            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">{item.icon}</div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">{item.label}</div>
                              <div className="text-xs text-gray-900">{item.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* timeline */}
                    {report.timeline && report.timeline.length > 0 && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-2">
                          <span className="inline-block w-1 h-4 rounded bg-red-500" />Linha do Tempo
                        </div>
                        <div className="relative pl-4">
                          <div className="absolute left-1 top-1 bottom-1 w-px bg-gray-200" />
                          <div className="space-y-4">
                            {report.timeline.map(item => (
                              <div key={item.id} className="relative flex gap-3">
                                <div className="mt-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow ring-2 ring-red-500" />
                                <div>
                                  <div className="text-[11px] text-gray-500">{formatDateTime(item.date)}</div>
                                  <div className="text-sm font-medium text-gray-900">{item.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* admin actions */}
                    {(user?.is_admin || user?.user_type === 'public_official') && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Button variant="outline" className="justify-center gap-2 text-sm" onClick={handleShare}><Share2 className="w-4 h-4" />Compartilhar</Button>
                          <Button variant="outline" className="justify-center gap-2 text-sm" onClick={handleEditClick}><Edit className="w-4 h-4" />Editar</Button>
                          <Button className="justify-center gap-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-white" onClick={handleMarkResolvedClick}><CheckCircle className="w-4 h-4" />Marcar Resolvido</Button>
                          <Button variant="outline" className="justify-center gap-2 text-sm" onClick={() => handleOpenLinkModal(report)}><LinkIcon className="w-4 h-4" />Vincular</Button>
                        </div>
                        <button type="button" onClick={handleReportError} className="inline-flex items-center gap-2 text-[11px] text-gray-500 hover:text-red-500 transition-colors">
                          <Flag className="w-4 h-4" />Reportar um erro nesta bronca
                        </button>
                      </div>
                    )}

                    {/* mobile upvote - Movido para baixo (menos prioritário) */}
                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 shadow-sm lg:hidden">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-1 text-center">Apoios</div>
                      <div className="text-3xl font-extrabold text-gray-900 text-center">{report.upvotes || 0}</div>
                      <div className="text-xs text-gray-500 mt-1 mb-4 text-center">pessoas apoiaram essa bronca</div>
                      <Button className="w-full justify-center gap-2 text-sm font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700" onClick={handleUpvoteClick}>
                        <ThumbsUp className={`w-4 h-4 ${report.user_has_upvoted ? 'fill-white text-white' : ''}`} />
                        {report.user_has_upvoted ? 'Apoiada' : 'Apoiar essa bronca'}
                      </Button>
                      <Button className="mt-2 w-full justify-center gap-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700" onClick={handleShare}>
                        <Share2 className="w-4 h-4" />Compartilhar bronca
                      </Button>
                      <Button variant="outline" className="w-full mt-2 justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 border-gray-200" onClick={() => handleFavoriteToggle(report.id, report.is_favorited)}>
                        <Star className={`w-4 h-4 ${report.is_favorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        {report.is_favorited ? 'Favoritada' : 'Favoritar'}
                      </Button>
                      {report.petitionId && (
                        <Button asChild className="w-full mt-2 justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white">
                          <Link to={`/abaixo-assinado/${report.petitionId}`}><FileSignature className="w-4 h-4" />Ver abaixo-assinado ligado</Link>
                        </Button>
                      )}
                    </div>

                    {/* ── SHARE SECTION ── */}
                    <section className="mt-6">
                      <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-r from-primary/10 via-rose-50 to-amber-50 dark:from-primary/20 dark:via-slate-900 dark:to-amber-900/40 p-6 sm:p-8 flex flex-col lg:flex-row items-center gap-6">
                        <div className="absolute inset-0 pointer-events-none opacity-40">
                          <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/25 rounded-full blur-3xl" />
                          <div className="absolute -bottom-10 -left-10 w-52 h-52 bg-amber-300/40 rounded-full blur-3xl" />
                        </div>
                        <div className="relative flex-1 space-y-4">
                          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-primary shadow-sm">
                            <Sparkles className="w-3 h-3" /><span>Compartilhe nos stories e grupos</span>
                          </div>
                          <h3 className="text-2xl sm:text-3xl font-bold leading-tight">Leve esta bronca para o Instagram e para seus amigos</h3>
                          <p className="text-sm sm:text-base text-muted-foreground max-w-xl">Use o QR Code ou o link da bronca para convidar mais pessoas a apoiar. Quanto mais gente ver esta página, maior a pressão por mudança.</p>
                          
                          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 pt-2">
                            <Button size="sm" onClick={handleCopyShareLink} className="w-full sm:w-auto justify-center bg-primary text-primary-foreground hover:bg-primary/90">
                              <Share2 className="w-4 h-4 mr-2" />Copiar link da bronca
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowFlyerModal(true)} className="w-full sm:w-auto justify-center border-primary/40 text-primary hover:bg-primary/5">
                              <FileText className="w-4 h-4 mr-2" />Baixar QR Code / Panfleto
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowStoryModal(true)}
                              className="w-full sm:w-auto justify-center border-[#E53935]/60 text-[#E53935] hover:bg-[#E53935] hover:text-white hover:shadow-md transition-colors">
                              <Instagram className="w-4 h-4 mr-2" />Baixar card de stories
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Dica: adicione o link nos stories e mostre o QR Code na tela para quem estiver por perto.</p>
                        </div>
                        <div className="relative flex-shrink-0">
                          <div className="relative z-10 flex items-center justify-center rounded-2xl bg-white/90 shadow-xl p-3">
                            {qrCodeUrl
                              ? <img src={qrCodeUrl} alt="QR Code da bronca" className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl" loading="lazy" />
                              : <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl bg-gray-100 flex items-center justify-center"><span className="text-xs text-gray-500">QR Code</span></div>
                            }
                          </div>
                          <div className="absolute -bottom-3 -right-3 rounded-full bg-primary text-primary-foreground p-2 shadow-lg"><Heart className="w-4 h-4" /></div>
                        </div>
                      </div>
                    </section>

                    {/* comments */}
                    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500"><MessageSquare className="w-3.5 h-3.5" /></div>
                        <h2 className="text-sm font-semibold text-gray-900">Comentários</h2>
                        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-500">{comments.length}</span>
                      </div>
                      <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                        {comments.length > 0 ? comments.map(comment => (
                          <div key={comment.id} className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                              {(comment.authorName || comment.author?.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-semibold text-gray-900 truncate">{comment.authorName || comment.author?.name || 'Anônimo'}</p>
                                <p className="text-[10px] text-gray-400 flex-shrink-0">{formatDateTime(comment.created_at)}</p>
                              </div>
                              <p className="text-xs text-gray-700 break-words">{comment.text}</p>
                            </div>
                          </div>
                        )) : <p className="text-xs text-gray-500 text-center py-4">Nenhum comentário aprovado ainda.</p>}
                      </div>
                      {user ? (
                        <form onSubmit={handleSubmitComment} className="mt-4 flex gap-2 items-center">
                          <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Adicione seu comentário..."
                            className="flex-1 text-xs sm:text-sm bg-white px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent" />
                          <Button type="submit" size="icon" className="flex-shrink-0"><Send className="w-3.5 h-3.5" /></Button>
                        </form>
                      ) : (
                        <div className="mt-4 text-center px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-600">
                          <Link to="/login" className="font-semibold text-red-600 hover:underline">Faça login</Link>{' '}ou{' '}
                          <Link to="/cadastro" className="font-semibold text-red-600 hover:underline">cadastre-se</Link>{' '}para comentar e acompanhar esta bronca.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SIDEBAR ── */}
              <aside className="space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-6 text-center hidden lg:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 mb-1">Apoios</div>
                  <div className="text-4xl font-extrabold text-gray-900">{report.upvotes || 0}</div>
                  <div className="text-xs text-gray-500 mt-1 mb-4">pessoas apoiaram essa bronca</div>
                  <Button className="w-full justify-center gap-2 text-sm font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700" onClick={handleUpvoteClick}>
                    <ThumbsUp className={`w-4 h-4 ${report.user_has_upvoted ? 'fill-white text-white' : ''}`} />
                    {report.user_has_upvoted ? 'Apoiada' : 'Apoiar essa bronca'}
                  </Button>
                  <Button className="mt-2 w-full justify-center gap-2 text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700" onClick={handleShare}>
                    <Share2 className="w-4 h-4" />Compartilhar bronca
                  </Button>
                  <Button variant="outline" className="w-full mt-2 justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 border-gray-200" onClick={() => handleFavoriteToggle(report.id, report.is_favorited)}>
                    <Star className={`w-4 h-4 ${report.is_favorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    {report.is_favorited ? 'Favoritada' : 'Favoritar'}
                  </Button>
                  {report.petitionId && (
                    <Button asChild className="w-full mt-2 justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white">
                      <Link to={`/abaixo-assinado/${report.petitionId}`}><FileSignature className="w-4 h-4" />Ver abaixo-assinado ligado</Link>
                    </Button>
                  )}
                </div>

                {/* Map Card (Desktop Only) */}
                <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 flex items-center">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-red-50 to-orange-50 text-red-600 mr-3 shadow-sm border border-red-100/50">
                        <MapPin className="w-4 h-4" />
                      </div>
                      Localização
                    </h3>
                  </div>
                  <div className="h-48">
                    <ReportMap location={report.location} address={report.address} />
                  </div>
                  <div className="px-4 py-4 bg-slate-50 space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Endereço</span>
                        <p className="text-sm font-medium text-slate-700 leading-tight">{report.address || 'Não informado'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {managementPanel && <div className="hidden lg:block">{managementPanel}</div>}
              </aside>
            </div>
          </div>

          {/* ── MODALS ── */}
          {showDonationModal && <DonationModal report={report} isOpen={showDonationModal} onClose={() => setShowDonationModal(false)} />}
          {mediaViewerState.isOpen && viewerMedia.length > 0 && (
            <MediaViewer media={viewerMedia} startIndex={mediaViewerState.startIndex} onClose={() => setMediaViewerState({ isOpen: false, startIndex: 0 })} />
          )}
          {showEditDetails && report && (
            <ReportDetails report={report} onClose={() => setShowEditDetails(false)} onUpdate={handleUpdateReport}
              onUpvote={handleUpvoteFromDetails} onLink={handleOpenLinkModal} onFavoriteToggle={handleFavoriteToggle}
              onDonate={() => setShowDonationModal(true)} startInEdit={true} />
          )}
          {showMarkResolvedModal && <MarkResolvedModal onClose={() => setShowMarkResolvedModal(false)} onSubmit={handleConfirmResolution} />}
          {showLinkModal && reportToLink && (
            <LinkReportModal sourceReport={reportToLink} allReports={allReports} onClose={() => setShowLinkModal(false)} onLink={handleLinkReport} />
          )}

          {/* flyer modal */}
          <ReportFlyerModal
            isOpen={showFlyerModal}
            onClose={() => setShowFlyerModal(false)}
            report={report}
            qrCodeUrl={qrCodeUrl}
            reportId={reportId}
            baseUrl={baseUrl}
            toast={toast}
          />

          <ReportStoryModal
            isOpen={showStoryModal}
            onClose={() => setShowStoryModal(false)}
            report={report}
            qrCodeUrl={qrCodeUrl}
            coverPhotoUrl={coverPhotoUrl}
          />
        </>
      )}
    </>
  );
};

export default ReportPage;