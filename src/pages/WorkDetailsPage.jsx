import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import DynamicSEO from '@/components/DynamicSeo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  ArrowLeft, Calendar, DollarSign, HardHat, PauseCircle, CheckCircle, MapPin, 
  Video, Image as ImageIcon, FileText, Clock, Building, Landmark, Award, 
  BookOpen, Heart, Dumbbell, Link2, Download, Star, Home, Wrench, 
  Share2, Edit, UploadCloud, User, Activity, ArrowUpRight, Info, AlertTriangle 
} from 'lucide-react';
import { formatCurrency, formatCnpj } from '@/lib/utils';
import MediaViewer from '@/components/MediaViewer';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { WorkEditModal } from './admin/ManageWorksPage';
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

const WorkMap = ({ location, bairro }) => {
  // Parse POINT(lng lat) if available, otherwise use default
  const position = useMemo(() => {
    if (location) {
      // Handle WKT string format: POINT(lng lat)
      if (typeof location === 'string') {
        const match = location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
        if (match) {
          return [parseFloat(match[2]), parseFloat(match[1])]; // Leaflet uses [lat, lng]
        }
      } 
      // Handle GeoJSON object format: { type: 'Point', coordinates: [lng, lat] }
      else if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
        return [location.coordinates[1], location.coordinates[0]]; // Leaflet uses [lat, lng]
      }
    }
    return FLORESTA_COORDS;
  }, [location]);

  return (
    <div className="h-64 w-full rounded-lg overflow-hidden relative z-0">
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
            {bairro || 'Localização da Obra'}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

const WorkDetailsPage = () => {
  const { workId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [work, setWork] = useState(null);
  const [media, setMedia] = useState([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewerState, setViewerState] = useState({ isOpen: false, startIndex: 0, items: [] });
  const [showContribDialog, setShowContribDialog] = useState(false);
  const [contribDescription, setContribDescription] = useState('');
  const [contribVideoUrl, setContribVideoUrl] = useState('');
  const [contribFiles, setContribFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [workEditOptions, setWorkEditOptions] = useState({ categories: [], areas: [], bairros: [], contractors: [] });
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [measurements, setMeasurements] = useState([]);

  const fetchWorkDetails = useCallback(async () => {
    setLoading(true);
    const { data: workData, error: workError } = await supabase
      .from('public_works')
      .select('*, work_category:work_categories(name), work_area:work_areas(name), bairro:bairros(name), contractor:contractor_id(id, name, cnpj)')
      .eq('id', workId)
      .single();

    if (workError) {
      toast({ title: "Erro ao buscar detalhes da obra", description: workError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: mediaData, error: mediaError } = await supabase
      .from('public_work_media')
      .select('*')
      .eq('work_id', workId)
      .order('media_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (mediaError) {
      toast({ title: "Erro ao buscar mídias da obra", description: mediaError.message, variant: "destructive" });
    }

    const { data: measurementsData, error: measurementsError } = await supabase
      .from('public_work_measurements')
      .select('*, contractor:contractor_id(name)')
      .eq('work_id', workId)
      .order('contract_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (user) {
      const { data: favoriteData, error: favoriteError } = await supabase
        .from('favorite_works')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('work_id', workId);
      
      if (!favoriteError) {
        setIsFavorited(favoriteData.length > 0);
      }
    } else {
      setIsFavorited(false);
    }

    setWork(workData);
    setMedia(mediaData || []);
    setMeasurements(measurementsData || []);
    setLoading(false);
  }, [workId, toast, user]);

  useEffect(() => {
    fetchWorkDetails();
  }, [fetchWorkDetails]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const fetchEditOptions = async () => {
      if (!user?.is_admin) return;
      const [categories, areas, bairros, contractors] = await Promise.all([
        supabase.from('work_categories').select('*'),
        supabase.from('work_areas').select('*'),
        supabase.from('bairros').select('*'),
        supabase.from('contractors').select('*'),
      ]);
      setWorkEditOptions({
        categories: categories.data || [],
        areas: areas.data || [],
        bairros: bairros.data || [],
        contractors: contractors.data || [],
      });
    };
    fetchEditOptions();
  }, [user?.is_admin]);

  const handleFavoriteToggle = async () => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para favoritar uma obra.", variant: "destructive" });
      navigate('/login');
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_works').delete().match({ user_id: user.id, work_id: workId });
      if (error) {
        toast({ title: "Erro ao desfavoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Obra removida dos favoritos! 💔" });
        setIsFavorited(false);
      }
    } else {
      const { error } = await supabase.from('favorite_works').insert({ user_id: user.id, work_id: workId });
      if (error) {
        toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Obra adicionada aos favoritos! ⭐" });
        setIsFavorited(true);
      }
    }
  };

  const seoData = useMemo(() => {
    const baseUrl = 'https://trombonecidadao.com.br';
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    
    let workImage = defaultThumbnail;
    
    if (work && work.thumbnail_url) {
      workImage = work.thumbnail_url;
    } else if (media && media.length > 0) {
      const firstImage = media.find(m => m.type === 'image' || m.type === 'photo');
      const firstVideo = media.find(m => m.type === 'video' || m.type === 'video_url');
      const mediaItem = firstImage || firstVideo;
      
      if (mediaItem && mediaItem.url) {
        let rawUrl = mediaItem.url;
        if (rawUrl.startsWith('http')) {
          try {
             const cleanUrl = rawUrl.split('?')[0];
             workImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`;
          } catch (e) { 
             workImage = rawUrl;
             console.error(e); 
          }
        } else {
           workImage = rawUrl;
        }
      }
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    return {
      title: work ? `Obra: ${work.title} - Trombone Cidadão` : 'Detalhes da Obra - Trombone Cidadão',
      description: work?.description || 'Acompanhe esta obra pública no Trombone Cidadão.',
      image: workImage,
      url: currentUrl
    };
  }, [work, media]);

  const viewableMedia = useMemo(() => media.filter(m => ['image', 'photo', 'video', 'video_url'].includes(m.type)), [media]);

  // Group media by gallery_name
  const galleryGroups = useMemo(() => {
    const groups = {};
    
    viewableMedia.forEach(item => {
      const name = item.gallery_name || 'Geral';
      if (!groups[name]) {
        groups[name] = [];
      }
      groups[name].push(item);
    });
    
    // Sort: 'Geral' first, then alphabetical
    return Object.entries(groups).map(([name, items]) => ({
      name,
      items
    })).sort((a, b) => {
        if (a.name === 'Geral') return -1;
        if (b.name === 'Geral') return 1;
        return a.name.localeCompare(b.name);
    });
  }, [viewableMedia]);

  // Flatten groups to get the display order for the lightbox
  const sortedViewableMedia = useMemo(() => {
    return galleryGroups.flatMap(group => group.items);
  }, [galleryGroups]);

  const documents = media.filter(m => m.type === 'pdf' || m.type === 'document' || m.type === 'file');

  const handleShareWork = async () => {
    if (typeof window === 'undefined' || !work) return;

    const url = window.location.href;
    const shareData = {
      title: work.title,
      text: work.description || 'Confira os detalhes desta obra pública no Trombone Cidadão.',
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      toast({ title: "Erro ao compartilhar", variant: "destructive" });
    }
  };

  const handleOpenContrib = () => {
    if (!user) {
      toast({ title: "Faça login para contribuir", description: "Você precisa entrar para enviar fotos ou dados.", variant: "destructive" });
      navigate('/login');
      return;
    }
    setShowContribDialog(true);
  };

  const handleContribFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setContribFiles(files);
  };

  const handleSubmitContribution = async () => {
    if (!user || !work || isSubmittingContribution) return;
    setIsSubmittingContribution(true);
    try {
      if (contribFiles.length > 0) {
        for (const file of contribFiles) {
          const path = `works/${work.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from('work-media').upload(path, file);
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(path);
          let type = 'file';
          if (file.type.startsWith('image')) type = 'image';
          else if (file.type.startsWith('video')) type = 'video';
          else if (file.type === 'application/pdf') type = 'pdf';
          const { error: dbError } = await supabase.from('public_work_media').insert({
            work_id: work.id,
            url: publicUrl,
            type,
            name: file.name,
            description: contribDescription || null,
            status: 'pending',
            contributor_id: user.id
          });
          if (dbError) throw dbError;
        }
      }
      if (contribVideoUrl && contribVideoUrl.trim().length > 0) {
        const { error: linkErr } = await supabase.from('public_work_media').insert({
          work_id: work.id,
          url: contribVideoUrl.trim(),
          type: 'video_url',
          name: 'Vídeo do cidadão',
          description: contribDescription || null,
          status: 'pending',
          contributor_id: user.id
        });
        if (linkErr) throw linkErr;
      }
      toast({ title: "Contribuição enviada! ✅", description: "Obrigado por colaborar com transparência." });
      setShowContribDialog(false);
      setContribDescription('');
      setContribVideoUrl('');
      setContribFiles([]);
      const { data: mediaData } = await supabase.from('public_work_media').select('*').eq('work_id', work.id).order('media_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      setMedia(mediaData || []);
    } catch (error) {
      toast({ title: "Erro ao enviar contribuição", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmittingContribution(false);
    }
  };

  const openViewer = (items, startIndex) => {
    const viewerItems = items.map(m => {
      if (m.type === 'image') return { ...m, type: 'photo' };
      if (m.type === 'video_url') return { ...m, type: 'video' };
      return m;
    });
    setViewerState({ isOpen: true, startIndex, items: viewerItems });
  };

  const closeViewer = () => {
    setViewerState({ isOpen: false, startIndex: 0, items: [] });
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'in-progress': return { text: 'Em Andamento', icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' };
      case 'completed': return { text: 'Concluída', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' };
      case 'stalled': return { text: 'Paralisada', icon: PauseCircle, color: 'text-red-600', bg: 'bg-red-100', border: 'border-amber-200' };
      case 'unfinished': return { text: 'Inacabada', icon: Wrench, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' };
      case 'planned': return { text: 'Prevista', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-100', border: 'border-purple-200' };
      case 'tendered': return { text: 'Licitada', icon: FileText, color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200' };
      default: return { text: 'Não definido', icon: HardHat, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' };
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-8">
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Obra não encontrada</h1>
        <Button asChild className="mt-4" variant="default">
          <Link to="/obras-publicas">Voltar para Obras</Link>
        </Button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(work.status);
  
  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-12 font-sans">
      <DynamicSEO {...seoData} />
      
      {/* Hero Section com Thumbnail */}
      <div className="w-full pt-24 pb-10 md:py-20 relative overflow-hidden min-h-[400px] flex ">
        {/* Thumbnail Background */}
        {work.thumbnail_url && (
          <div 
            className="absolute inset-0 z-0  bg-cover bg-center transition-transform duration-700 hover:scale-105"
            style={{ backgroundImage: `url(${work.thumbnail_url})` }}
          />
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/90 to-neutral-900/60 z-0" />
        
        {/* Padrão de fundo sutil */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] z-0" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap gap-3 mb-6"
            >
              {work.work_category && (
                <Badge variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-white/10 px-3 py-1 backdrop-blur-sm">
                  {work.work_category.name}
                </Badge>
              )}
              <Badge variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-white/10 px-3 py-1 backdrop-blur-sm">
                {work.work_area?.name || 'Geral'}
              </Badge>
              <Badge className={`${statusInfo.bg} ${statusInfo.color} border-none px-3 py-1 font-semibold`}>
                <statusInfo.icon className="w-3 h-3 mr-1.5" />
                {statusInfo.text}
              </Badge>
              {work.bairro && (
                <Badge variant="outline" className="text-white border-white/30 backdrop-blur-sm">
                  <MapPin className="w-3 h-3 mr-1.5" />
                  {work.bairro.name}
                </Badge>
              )}
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl md:text-4xl lg:text-4xl font-bold text-white mb-4 leading-tight shadow-sm"
            >
              {work.title}
            </motion.h1>

            {work.description && work.description.length < 300 && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="text-lg md:text-md text-neutral-200 mb-6 max-w-3xl leading-relaxed font-light"
              >
                {work.description}
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-2 text-neutral-400 text-sm mb-8"
            >
              <Clock className="w-4 h-4" />
              <span>Última atualização: {work.updated_at ? new Date(work.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}</span>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col md:flex-row gap-4 mt-4 flex-wrap"
            >
              {/* Botões Principais (Contribuição e Gerenciar) */}
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <Button onClick={handleOpenContrib} className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 border-0 w-full sm:w-auto sm:flex-1 md:flex-none whitespace-nowrap">
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Enviar Contribuição
                </Button>
                
                {user?.is_admin && (
                  <Button variant="secondary" className="bg-white text-slate-900 hover:bg-slate-100 w-full sm:w-auto sm:flex-1 md:flex-none whitespace-nowrap" onClick={() => setShowAdminEditModal(true)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Gerenciar
                  </Button>
                )}
              </div>

              {/* Botões Secundários (Desktop) */}
              <div className="hidden md:flex gap-3 items-center">
                <Button variant="outline" className="bg-white/5 border-white/20 text-white hover:bg-white/10 backdrop-blur-sm" onClick={handleShareWork}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
                <Button 
                  variant="ghost" 
                  className={`hover:bg-white/10 ${isFavorited ? 'text-yellow-400' : 'text-white'}`}
                  onClick={handleFavoriteToggle}
                >
                  <Star className={`w-4 h-4 mr-2 ${isFavorited ? 'fill-current' : ''}`} />
                  {isFavorited ? 'Salvo' : 'Salvar'}
                </Button>
                <Button 
                  variant="ghost" 
                  className="text-white/70 hover:text-white hover:bg-white/10"
                  onClick={() => setShowReportDialog(true)}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Informar Erro
                </Button>
              </div>
              {/* Botões Secundários (Mobile) */}
              <div className="flex md:hidden gap-2 justify-end w-full">
                <Button variant="secondary" size="icon" className="rounded-full bg-white/10 border border-white/10 text-white hover:bg-white/20 backdrop-blur-md shadow-sm" onClick={handleShareWork}>
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="secondary" 
                  size="icon"
                  className={`rounded-full border backdrop-blur-md shadow-sm ${isFavorited ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30' : 'bg-white/10 text-white border-white/10 hover:bg-white/20'}`}
                  onClick={handleFavoriteToggle}
                >
                  <Star className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
                </Button>
                <Button 
                  variant="secondary" 
                  size="icon"
                  className="rounded-full bg-white/10 border border-white/10 text-white hover:bg-white/20 backdrop-blur-md shadow-sm"
                  onClick={() => setShowReportDialog(true)}
                >
                  <AlertTriangle className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-8 relative z-30 mb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Card de Progresso e Orçamento (Mobile/Desktop) */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card className="border-none shadow-xl bg-white/95 backdrop-blur overflow-hidden">
                <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="sm:col-span-2 space-y-2">
                    <div className="flex justify-between text-sm font-medium text-slate-500 mb-1">
                      <span>Progresso Geral</span>
                      <span className="text-primary font-bold">{work.execution_percentage || 0}%</span>
                    </div>
                    <Progress value={work.execution_percentage || 0} className="h-3 bg-slate-100" />
                    <p className="text-xs text-slate-400 mt-1">
                      Atualizado em {work.updated_at ? new Date(work.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                    <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Orçamento Total</span>
                    <div className="text-2xl font-bold text-slate-800 flex items-center gap-1 mt-1">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      {work.total_value 
                        ? formatCurrency(work.total_value) 
                        : 'Não informado'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="space-y-8">
              {/* Visão Geral */}
              <div className="space-y-6">
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl text-slate-800">Sobre a Obra</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
                      <p className="whitespace-pre-wrap">{work.long_description || work.description}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Ficha Técnica Completa */}
                <div className="space-y-4 pt-4 border-t border-neutral-100">
                  <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2 mb-4">
                    <Info className="w-5 h-5 text-neutral-600" />
                    Ficha Técnica e Prazos
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Bairro */}
                    {work.bairro && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Bairro</span>
                          <p className="font-semibold text-neutral-800">{work.bairro.name}</p>
                        </div>
                      </div>
                    )}

                    {/* Endereço */}
                    {work.address && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow col-span-1 sm:col-span-2">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Endereço</span>
                          <p className="font-semibold text-neutral-800">{work.address}</p>
                        </div>
                      </div>
                    )}

                    {/* Valor Total */}
                    <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                      <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Valor Total</span>
                        <p className="font-semibold text-neutral-800">
                          {work.total_value ? formatCurrency(work.total_value) : 'Não informado'}
                        </p>
                      </div>
                    </div>

                    {/* Valor Gasto */}
                    {work.amount_spent > 0 && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <Activity className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Valor Gasto</span>
                          <p className="font-semibold text-neutral-800">{formatCurrency(work.amount_spent)}</p>
                        </div>
                      </div>
                    )}

                    {/* Construtora */}
                    {work.contractor && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <Building className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Construtora</span>
                          <p className="font-semibold text-neutral-800 line-clamp-1" title={work.contractor.name}>{work.contractor.name}</p>
                        </div>
                      </div>
                    )}

                    {/* CNPJ */}
                    {work.contractor?.cnpj && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">CNPJ</span>
                          <p className="font-semibold text-neutral-800">{formatCnpj(work.contractor.cnpj)}</p>
                        </div>
                      </div>
                    )}

                    {/* Fonte de Recurso */}
                    {work.funding_source && work.funding_source.length > 0 && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Fontes de Recurso</span>
                          <p className="font-semibold text-neutral-800">{work.funding_source.join(', ')}</p>
                        </div>
                      </div>
                    )}

                    {/* Prazo */}
                    {work.execution_period_days && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Prazo de Execução</span>
                          <p className="font-semibold text-neutral-800">{work.execution_period_days} dias</p>
                        </div>
                      </div>
                    )}

                    {/* Dates Loop */}
                    {[
                      { label: 'Assinatura Contrato', date: work.contract_signature_date, icon: Edit },
                      { label: 'Ordem de Serviço', date: work.service_order_date, icon: FileText },
                      { label: 'Início Previsto', date: work.predicted_start_date, icon: Calendar },
                      { label: 'Início Real', date: work.start_date, icon: Activity },
                      { label: 'Previsão Entrega', date: work.expected_end_date, icon: CheckCircle },
                      { label: 'Inauguração', date: work.inauguration_date, icon: Star },
                    ].map((item, idx) => item.date && (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{item.label}</span>
                          <p className="font-semibold text-neutral-800">{new Date(item.date).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                    ))}

                    {/* Emenda Parlamentar */}
                    {work.parliamentary_amendment?.has && (
                      <div className="bg-white p-4 rounded-xl border border-neutral-100 flex items-start gap-3 col-span-1 sm:col-span-2 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-2 bg-neutral-100 text-neutral-600 rounded-lg">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Emenda Parlamentar</span>
                          <p className="font-semibold text-neutral-800">{work.parliamentary_amendment.author}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Linha do Tempo */}
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-800 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Histórico de Atividades
                  </CardTitle>
                  <CardDescription>Acompanhe a evolução da obra fase a fase</CardDescription>
                </CardHeader>
                <CardContent className="relative pl-6 sm:pl-10 space-y-8 before:absolute before:left-6 sm:before:left-10  before:h-full before:w-[2px] before:bg-slate-200">
                  {measurements.length > 0 ? (
                    measurements.map((item, index) => (
                      <div key={item.id} className="relative pl-8">
                        <div className={`absolute -left-[9px] top-1 w-5 h-5 rounded-full border-4 border-white shadow-sm ${getStatusInfo(item.status).bg.replace('bg-', 'bg-')}`} />
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-primary/20 hover:shadow-md transition-all duration-300">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <h4 className="font-bold text-slate-800 text-lg">{item.title}</h4>
                            <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-md border shadow-sm">
                              {item.contract_date ? new Date(item.contract_date).toLocaleDateString('pt-BR') : 'Data n/d'}
                            </span>
                          </div>
                          <p className="text-slate-600 mb-4 text-sm">{item.description}</p>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-200/60">
                            <div>
                              <span className="text-xs text-slate-400 block mb-1">Status</span>
                              <Badge variant="outline" className={`${getStatusInfo(item.status).color} ${getStatusInfo(item.status).bg} border-none`}>
                                {getStatusInfo(item.status).text}
                              </Badge>
                            </div>
                            <div>
                              <span className="text-xs text-slate-400 block mb-1">Valor</span>
                              <span className="text-sm font-semibold text-slate-700 block">
                                {item.value ? formatCurrency(item.value) : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs text-slate-400 block mb-1">Execução</span>
                              <span className="text-sm font-semibold text-slate-700 block">
                                {item.execution_percentage !== null ? `${item.execution_percentage}%` : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs text-slate-400 block mb-1">Responsável</span>
                              <span className="text-sm font-semibold text-slate-700 block truncate" title={item.contractor?.name}>
                                {item.contractor?.name || 'Não informado'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 text-center py-8">Nenhuma atividade registrada.</p>
                  )}
                </CardContent>
              </Card>

              {/* Galeria */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold text-slate-800">Galeria de Mídia</h3>
                </div>
                
                {galleryGroups.length > 0 ? (
                  galleryGroups.map((group) => (
                    <div key={group.name} className="space-y-4">
                      {(galleryGroups.length > 1 || group.name !== 'Geral') && (
                        <h4 className="text-lg font-semibold text-slate-700 border-l-4 border-primary pl-3 bg-slate-50 py-1 rounded-r-lg">
                          {group.name}
                        </h4>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {group.items.map((item, idx) => (
                          <motion.div 
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative shadow-sm hover:shadow-lg transition-all bg-slate-100"
                            onClick={() => openViewer(sortedViewableMedia, sortedViewableMedia.findIndex(m => m.id === item.id))}
                          >
                            {['video', 'video_url'].includes(item.type) ? (
                              <div className="w-full h-full flex items-center justify-center bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                <Video className="w-16 h-16 text-white/50 group-hover:text-white group-hover:scale-110 transition-all duration-300" />
                              </div>
                            ) : (
                              <img 
                                src={item.url} 
                                alt={item.description || 'Foto da obra'} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                loading="lazy"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                            <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <p className="text-white text-xs font-medium truncate drop-shadow-md">
                                {['video', 'video_url'].includes(item.type) ? 'Vídeo' : item.description}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
                    <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Galeria vazia por enquanto.</p>
                  </div>
                )}
              </div>

              {/* Documentos */}
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Documentação Oficial
                  </CardTitle>
                  <CardDescription>Acesse contratos, relatórios e outros documentos públicos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {documents.length > 0 ? (
                      documents.map((doc, idx) => (
                        <AccordionItem key={doc.id} value={`item-${idx}`}>
                          <AccordionTrigger className="hover:no-underline hover:bg-slate-50 px-4 rounded-lg">
                            <div className="flex items-center gap-3 text-left w-full min-w-0">
                              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg flex-shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-800 break-all pr-2">{doc.name}</p>
                                <p className="text-xs text-slate-500">Adicionado em {new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4 pt-2">
                            <p className="text-sm text-slate-600 mb-4">{doc.description || 'Sem descrição adicional.'}</p>
                            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                              <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
                                <Download className="w-4 h-4 mr-2" />
                                Baixar Documento
                              </a>
                            </Button>
                          </AccordionContent>
                        </AccordionItem>
                      ))
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-slate-500">Nenhum documento disponível.</p>
                      </div>
                    )}
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Responsável / Construtora */}
            <Card className="border-none shadow-sm overflow-hidden">
              <div className="h-2 bg-primary w-full" />
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="w-5 h-5 text-primary" />
                  Responsável Técnico
                </CardTitle>
              </CardHeader>
              <CardContent>
                {work.contractor ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border-2 border-slate-100">
                        <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(work.contractor.name)}&background=random`} />
                        <AvatarFallback><User /></AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{work.contractor.name}</p>
                        <p className="text-xs text-slate-500">Contratada Principal</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">CNPJ</span>
                        <span className="font-medium text-slate-700">{work.contractor.cnpj ? formatCnpj(work.contractor.cnpj) : '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Status</span>
                        <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Ativo</Badge>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Informação não disponível.</p>
                )}
              </CardContent>
            </Card>

            {/* Localização */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Localização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <WorkMap location={work.location} bairro={work.bairro?.name} />
                <div className="text-sm text-slate-600">
                  <p className="font-medium">Endereço:</p>
                  <p>{work.address || `${work.bairro?.name || ''}, Município`}</p>
                </div>
              </CardContent>
            </Card>

            {/* Links Úteis */}
            {work.related_links && work.related_links.length > 0 && (
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-primary" />
                    Links Relacionados
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {work.related_links.map((link, idx) => (
                    <a 
                      key={idx} 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group"
                    >
                      <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{link.title}</span>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>

      {/* Disclaimer Section */}
      <div className="container mx-auto px-4 mb-12">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 text-center">
          <p className="text-neutral-600 text-sm leading-relaxed">
            <span className="font-semibold block mb-1">Fonte dos Dados</span>
            Os dados publicados são fornecidos por portais da transparência e órgãos públicos, e verificados pela equipe do Trombone Cidadão.
            <br className="hidden sm:block" />
            Trabalhamos para manter as informações atualizadas, mas podem ocorrer divergências em relação à situação real da obra.
          </p>
        </div>
      </div>

      {viewerState.isOpen && (
        <MediaViewer 
          onClose={closeViewer} 
          media={viewerState.items} 
          startIndex={viewerState.startIndex} 
        />
      )}

      {/* Report Error Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-neutral-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Informar Erro ou Inconsistência
            </DialogTitle>
            <p className="text-sm text-neutral-500">
              Ajude-nos a manter os dados corretos. Se você identificou algum erro nesta obra, por favor nos avise.
            </p>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-amber-800 text-sm">
              <p>Ao clicar no botão abaixo, seu gerenciador de e-mail será aberto com as informações da obra já preenchidas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReportDialog(false)}>Cancelar</Button>
            <Button asChild className="bg-neutral-900 text-white hover:bg-neutral-800">
              <a 
                href={`mailto:contato@trombonecidadao.com.br?subject=Erro na Obra: ${encodeURIComponent(work.title)}&body=Olá, gostaria de informar um erro na obra "${work.title}" (ID: ${work.id}).%0D%0A%0D%0ADetalhes do erro:%0D%0A`}
              >
                Enviar E-mail
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContribDialog} onOpenChange={setShowContribDialog}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Contribuir com esta obra</DialogTitle>
            <p className="text-sm text-slate-500">Ajude a monitorar o progresso enviando fotos ou informações.</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="contrib_description">Descrição</Label>
              <Textarea 
                id="contrib_description" 
                value={contribDescription} 
                onChange={(e) => setContribDescription(e.target.value)} 
                placeholder="O que você observou? (ex: 'Fundações concluídas')" 
                rows={3} 
                className="resize-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrib_files">Fotos/Vídeos</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Clique para selecionar arquivos</p>
                <Input 
                  id="contrib_files" 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*,video/*,application/pdf" 
                  multiple 
                  className="hidden" 
                  onChange={handleContribFilesChange} 
                />
              </div>
              {contribFiles.length > 0 && (
                <p className="text-xs font-medium text-green-600">{contribFiles.length} arquivo(s) selecionado(s)</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrib_video">Link de Vídeo (Opcional)</Label>
              <Input 
                id="contrib_video" 
                placeholder="https://youtube.com/..." 
                value={contribVideoUrl} 
                onChange={(e) => setContribVideoUrl(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowContribDialog(false)} disabled={isSubmittingContribution}>Cancelar</Button>
            <Button type="button" onClick={handleSubmitContribution} disabled={isSubmittingContribution} className="bg-primary text-white hover:bg-primary/90">
              {isSubmittingContribution ? 'Enviando...' : 'Enviar Contribuição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user?.is_admin && (
        <WorkEditModal
          work={showAdminEditModal ? work : null}
          onSave={async (workToSave) => {
            const { id, location, ...data } = workToSave;
            delete data.bairro;
            delete data.work_category;
            delete data.work_area;
            delete data.contractor;
            const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
            const payload = { ...data, location: locationString };
            ['bairro_id', 'work_category_id', 'work_area_id', 'contractor_id'].forEach(key => {
              if (payload[key] === '') payload[key] = null;
            });
            if (!Array.isArray(payload.funding_source)) {
              payload.funding_source = [];
            }
            const result = await supabase.from('public_works').update(payload).eq('id', id).select().single();
            if (result.error) {
              toast({ title: "Erro ao salvar obra", description: result.error.message, variant: "destructive" });
            } else {
              toast({ title: "Obra atualizada com sucesso!" });
              setShowAdminEditModal(false);
              fetchWorkDetails();
            }
          }}
          onClose={() => setShowAdminEditModal(false)}
          workOptions={workEditOptions}
        />
      )}
    </div>
  );
};

export default WorkDetailsPage;
