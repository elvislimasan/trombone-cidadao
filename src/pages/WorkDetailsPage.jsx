import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Calendar, DollarSign, HardHat, PauseCircle, CheckCircle, MapPin, Video, Image as ImageIcon, FileText, Clock, Building, Landmark, Award, BookOpen, Heart, Dumbbell, Link2, Download, Star, Home, Wrench, FileCheck, Share2, Edit } from 'lucide-react';
import { formatCurrency, formatCnpj } from '@/lib/utils';
import MediaViewer from '@/components/MediaViewer';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { WorkEditModal } from './admin/ManageWorksPage';

// Componente para gerar thumbnail de vídeo direto (movido para fora para evitar problemas com hooks)
const VideoThumbnail = React.memo(({ videoUrl, alt, className }) => {
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
      <div className={`${className} bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center`}>
        <Video className="h-12 w-12 text-gray-400" />
      </div>
    );
  }

  return <img src={thumbnail} alt={alt} className={className} />;
});

VideoThumbnail.displayName = 'VideoThumbnail';

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

    if (user) {
      const { data: favoriteData, error: favoriteError } = await supabase
        .from('favorite_works')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('work_id', workId);
      
      if (!favoriteError) {
        setIsFavorited(favoriteData.length > 0);
      }
    }

    setWork(workData);
    setMedia(mediaData || []);
    setLoading(false);
  }, [workId, toast, user]);

  useEffect(() => {
    fetchWorkDetails();
  }, [fetchWorkDetails]);

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
        toast({ title: "Compartilhado com sucesso! 📣" });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
      }
    } catch {
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
      // Upload arquivos (imagens/vídeos) para o bucket 'work-media'
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
      // Inserir link de vídeo (YouTube/Instagram) como mídia, se fornecido
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
      // Atualizar galeria
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
      case 'in-progress': return { text: 'Em Andamento', icon: HardHat, color: 'text-blue-500' };
      case 'completed': return { text: 'Concluída', icon: CheckCircle, color: 'text-green-500' };
      case 'stalled': return { text: 'Paralisada', icon: PauseCircle, color: 'text-amber-500' };
      case 'unfinished': return { text: 'Inacabada', icon: Wrench, color: 'text-red-500' };
      case 'planned': return { text: 'Prevista', icon: Calendar, color: 'text-purple-500' };
      case 'tendered': return { text: 'Licitada', icon: FileText, color: 'text-orange-500' };
      default: return { text: 'Não definido', icon: HardHat, color: 'text-gray-500' };
    }
  };

  const getAreaIcon = (areaName) => {
    if (!areaName) return Award;
    const lowerArea = areaName.toLowerCase();
    if (lowerArea.includes('saúde')) return Heart;
    if (lowerArea.includes('educação')) return BookOpen;
    if (lowerArea.includes('esporte')) return Dumbbell;
    return Award;
  };

  const getYoutubeThumbnail = (url) => {
    try {
      let videoId;
      if (url.includes('youtube.com/watch?v=')) {
        videoId = new URL(url).searchParams.get('v');
      } else if (url.includes('youtu.be/')) {
        videoId = new URL(url).pathname.slice(1);
      }
      return videoId ? `https://img.youtube.com/vi/${videoId}/0.jpg` : null;
    } catch (e) {
      return null;
    }
  };


  if (loading) {
    return <div className="flex justify-center items-center h-screen">Carregando detalhes da obra...</div>;
  }

  if (!work) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Obra não encontrada</h1>
        <Button asChild className="mt-4">
          <Link to="/obras-publicas">Voltar para Obras</Link>
        </Button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(work.status);
  const AreaIcon = getAreaIcon(work.work_area?.name);

  // Função para traduzir e remover duplicatas das fontes de recurso
  const getFundingSourceText = (sources) => {
    if (!sources || sources.length === 0) return null;
    const sourceMap = { 
      federal: 'Federal', 
      state: 'Estadual', 
      estadual: 'Estadual', // Adicionar para caso já esteja traduzido
      municipal: 'Municipal',
      unknown: null // Ignorar 'unknown'
    };
    // Remover duplicatas e valores nulos/undefined, traduzir e filtrar
    const uniqueSources = [...new Set(sources)]
      .map(s => sourceMap[s?.toLowerCase()] || s)
      .filter(s => s && s !== 'unknown' && s !== null && s !== undefined);
    
    // Remover duplicatas novamente após tradução (caso tenha "state" e "estadual" juntos)
    const finalSources = [...new Set(uniqueSources)];
    
    return finalSources.length > 0 ? finalSources.join(', ') : null;
  };

  const details = [
    { icon: Home, label: 'Bairro', value: work.bairro?.name },
    { icon: DollarSign, label: 'Valor Total', value: work.total_value ? formatCurrency(work.total_value) : null },
    { icon: DollarSign, label: 'Valor Gasto', value: work.amount_spent ? formatCurrency(work.amount_spent) : null },
    { icon: Calendar, label: 'Assinatura do Contrato', value: work.contract_signature_date ? new Date(work.contract_signature_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Ordem de Serviço', value: work.service_order_date ? new Date(work.service_order_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Data prevista para início', value: work.predicted_start_date ? new Date(work.predicted_start_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Início', value: work.start_date ? new Date(work.start_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Previsão de Conclusão', value: work.expected_end_date ? new Date(work.expected_end_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Data da Inauguração', value: work.inauguration_date ? new Date(work.inauguration_date).toLocaleDateString('pt-BR') : null },
    { icon: Building, label: 'Construtora', value: work.contractor?.name },
    { icon: FileCheck, label: 'CNPJ', value: work.contractor?.cnpj ? formatCnpj(work.contractor.cnpj) : null },
    { icon: Landmark, label: 'Fontes de Recurso', value: getFundingSourceText(work.funding_source) },
    { icon: Clock, label: 'Prazo de Execução', value: work.execution_period_days ? `${work.execution_period_days} dias` : null },
    { icon: PauseCircle, label: 'Data de Paralisação', value: work.stalled_date ? new Date(work.stalled_date).toLocaleDateString('pt-BR') : null },
  ].filter(d => d.value);

  const photos = media.filter(m => m.type === 'image');
  const videos = media.filter(m => m.type === 'video' || m.type === 'video_url');
  const documents = media.filter(m => m.type === 'pdf');

  const MediaSection = ({ title, items, icon: Icon, onOpen }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2"><Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> {title}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {items.map((item, index) => {
            const isVideoUrl = item.type === 'video_url';
            const isDirectVideo = item.type === 'video' && !isVideoUrl;
            let thumbnailUrl = item.url;
            
            if (isVideoUrl) {
              thumbnailUrl = getYoutubeThumbnail(item.url);
            }

            return (
              <motion.div
                key={item.id}
                className="relative rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => onOpen(items, index)}
                whileHover={{ scale: 1.05 }}
              >
                <div className="aspect-square relative">
                  {isDirectVideo ? (
                    <VideoThumbnail 
                      videoUrl={item.url} 
                      alt={item.name || 'Vídeo'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img 
                      src={thumbnailUrl || 'https://placehold.co/400x400/000000/FFFFFF/png?text=Media'} 
                      alt={item.name} 
                      className="w-full h-full object-cover" 
                    />
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon className="h-10 w-10 text-white" />
                  </div>
                </div>
                <div className="p-2 bg-background/80 backdrop-blur-sm">
                  {item.description && <p className="text-xs font-semibold truncate">{item.description}</p>}
                  {item.media_date && <p className="text-xs text-muted-foreground">{new Date(item.media_date).toLocaleDateString('pt-BR')}</p>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  const DocumentSection = ({ items }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2"><FileText className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Documentos</h3>
        <div className="space-y-2">
          {items.map(doc => (
            <div key={doc.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg">
              <div className="flex-grow min-w-0">
                <p className="font-medium text-sm sm:text-base break-words">{doc.name}</p>
                {doc.description && <p className="text-xs sm:text-sm text-muted-foreground break-words">{doc.description}</p>}
              </div>
              <Button asChild variant="outline" size="sm" className="flex-shrink-0 w-full sm:w-auto">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
                  <Download className="mr-2 h-4 w-4" /> Baixar
                </a>
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const RelatedLinksSection = ({ links }) => {
    if (!links || links.length === 0) return null;
    return (
      <div className="mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2"><Link2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Matérias e Links</h3>
        <div className="space-y-2">
          {links.map((link, index) => (
            <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
              <p className="font-medium text-primary text-sm sm:text-base break-words">{link.title}</p>
              <p className="text-xs sm:text-sm text-muted-foreground break-all">{link.url}</p>
            </a>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>{work.title} - Detalhes da Obra</title>
        <meta name="description" content={work.description} />
      </Helmet>

      {viewerState.isOpen && (
        <MediaViewer
          media={viewerState.items}
          startIndex={viewerState.startIndex}
          onClose={closeViewer}
        />
      )}

      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-12 pb-24 lg:pb-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <Button asChild variant="ghost" className="text-sm">
              <Link to="/obras-publicas"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
            </Button>
            <div className="flex flex-wrap gap-2">
              {user?.is_admin ? (
                <Button variant="default" onClick={() => setShowAdminEditModal(true)} className="gap-2 text-sm">
                  <Edit className="w-4 h-4" />
                  Editar
                </Button>
              ) : (
                <Button variant="outline" onClick={handleOpenContrib} className="gap-2 text-sm">
                  <UploadIcon />
                  Enviar fotos e dados
                </Button>
              )}
              <Button variant="outline" onClick={handleShareWork} className="gap-2 text-sm">
                <Share2 className="w-4 h-4" />
                Compartilhar
              </Button>
              <Button variant="outline" onClick={handleFavoriteToggle} className="gap-2 text-sm">
                <Star className={`w-4 h-4 transition-colors ${isFavorited ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                {isFavorited ? 'Favoritado' : 'Favoritar'}
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="bg-muted/50 p-4 sm:p-6">
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {work.work_category?.name && <span className="text-xs sm:text-sm font-semibold bg-primary/10 text-primary px-2 py-1 rounded">{work.work_category.name}</span>}
                    {work.work_area?.name && <span className="flex items-center gap-2 text-xs sm:text-sm font-semibold bg-secondary text-secondary-foreground px-2 py-1 rounded"><AreaIcon className="w-3 h-3 sm:w-4 sm:h-4" /> {work.work_area.name}</span>}
                  </div>
                  <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold text-tc-red leading-tight">{work.title}</CardTitle>
                  {work.description && <CardDescription className="mt-2 text-sm sm:text-base md:text-lg">{work.description}</CardDescription>}
                </div>
                <div className={`flex-shrink-0 flex items-center gap-2 text-sm sm:text-base md:text-lg font-semibold p-2 rounded-md ${statusInfo.color}`}>
                  <statusInfo.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span>{statusInfo.text}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {work.execution_percentage > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-sm sm:text-base">Progresso da Obra</span>
                    <span className="font-bold text-tc-red text-sm sm:text-base">{work.execution_percentage}%</span>
                  </div>
                  <Progress value={work.execution_percentage} className="h-3" />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                {details.map((detail, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50">
                    <div className="bg-primary/10 p-2 rounded-md flex-shrink-0">
                      <detail.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">{detail.label}</p>
                      <p className="font-semibold text-sm sm:text-base break-words leading-relaxed">{detail.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pb-4">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Galeria e Documentos</h2>
                {media.length > 0 || (work.related_links && work.related_links.length > 0) ? (
                  <>
                    <MediaSection title="Fotos" items={photos} icon={ImageIcon} onOpen={openViewer} />
                    <MediaSection title="Vídeos" items={videos} icon={Video} onOpen={openViewer} />
                    <DocumentSection items={documents} />
                    <RelatedLinksSection links={work.related_links} />
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg text-sm sm:text-base">Nenhuma mídia, documento ou link disponível para esta obra.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={showContribDialog} onOpenChange={setShowContribDialog}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Contribuir com esta obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="contrib_description">Descrição</Label>
              <Textarea id="contrib_description" value={contribDescription} onChange={(e) => setContribDescription(e.target.value)} placeholder="Contextualize suas fotos ou informe dados relevantes" rows={4} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrib_files">Fotos/Vídeos (opcional)</Label>
              <Input id="contrib_files" ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" multiple onChange={handleContribFilesChange} />
              <p className="text-xs text-muted-foreground">Arquivos aceitos: imagens, vídeos ou PDF. Tamanho conforme limite do servidor.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrib_video">URL de Vídeo (opcional)</Label>
              <Input id="contrib_video" placeholder="Link do YouTube/Instagram" value={contribVideoUrl} onChange={(e) => setContribVideoUrl(e.target.value)} />
            </div>
            <div className="text-xs text-muted-foreground">
              Ao contribuir, você concorda em publicar seu material para transparência da obra.
            </div>
          </div>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingContribution}>Cancelar</Button></DialogClose>
            <Button type="button" onClick={handleSubmitContribution} disabled={isSubmittingContribution}>
              {isSubmittingContribution ? 'Enviando...' : 'Enviar'}
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
              // Recarrega detalhes
              const { data: refreshed } = await supabase
                .from('public_works')
                .select('*, work_category:work_categories(name), work_area:work_areas(name), bairro:bairros(name), contractor:contractor_id(id, name, cnpj)')
                .eq('id', id)
                .single();
              setWork(refreshed || result.data);
            }
          }}
          onClose={() => setShowAdminEditModal(false)}
          workOptions={workEditOptions}
        />
      )}
    </>
  );
};

export default WorkDetailsPage;

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5-5 5 5" />
    <path d="M12 15V5" />
  </svg>
);
