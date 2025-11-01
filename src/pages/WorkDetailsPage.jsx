import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, DollarSign, HardHat, PauseCircle, CheckCircle, MapPin, Video, Image as ImageIcon, FileText, Clock, Building, Landmark, Award, BookOpen, Heart, Dumbbell, Link2, Download, Star, Home, Wrench } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import MediaViewer from '@/components/MediaViewer';
import { useAuth } from '@/contexts/SupabaseAuthContext';

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

  const fetchWorkDetails = useCallback(async () => {
    setLoading(true);
    const { data: workData, error: workError } = await supabase
      .from('public_works')
      .select('*, work_category:work_categories(name), work_area:work_areas(name), bairro:bairros(name)')
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

  const details = [
    { icon: Home, label: 'Bairro', value: work.bairro?.name },
    { icon: DollarSign, label: 'Valor Total', value: work.total_value ? formatCurrency(work.total_value) : null },
    { icon: DollarSign, label: 'Valor Gasto', value: work.amount_spent ? formatCurrency(work.amount_spent) : null },
    { icon: Calendar, label: 'Ordem de Serviço', value: work.service_order_date ? new Date(work.service_order_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Início', value: work.start_date ? new Date(work.start_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Previsão de Conclusão', value: work.expected_end_date ? new Date(work.expected_end_date).toLocaleDateString('pt-BR') : null },
    { icon: Calendar, label: 'Data da Inauguração', value: work.inauguration_date ? new Date(work.inauguration_date).toLocaleDateString('pt-BR') : null },
    { icon: Building, label: 'Construtora', value: work.contractor?.name },
    { icon: Landmark, label: 'Fontes de Recurso', value: work.funding_source?.join(', ') },
    { icon: Clock, label: 'Prazo de Execução', value: work.execution_period_days ? `${work.execution_period_days} dias` : null },
    { icon: PauseCircle, label: 'Data de Paralisação', value: work.stalled_date ? new Date(work.stalled_date).toLocaleDateString('pt-BR') : null },
  ].filter(d => d.value);

  const photos = media.filter(m => m.type === 'image');
  const videos = media.filter(m => m.type === 'video' || m.type === 'video_url');
  const documents = media.filter(m => m.type === 'pdf');

  const MediaSection = ({ title, items, icon: Icon, onOpen }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2"><Icon className="w-6 h-6 text-primary" /> {title}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item, index) => {
            const isVideoUrl = item.type === 'video_url';
            let thumbnailUrl = item.url;
            if (isVideoUrl) thumbnailUrl = getYoutubeThumbnail(item.url);

            return (
              <motion.div
                key={item.id}
                className="relative rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => onOpen(items, index)}
                whileHover={{ scale: 1.05 }}
              >
                <div className="aspect-square">
                  <img src={thumbnailUrl || 'https://placehold.co/400x400/000000/FFFFFF/png?text=Media'} alt={item.name} className="w-full h-full object-cover" />
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
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Documentos</h3>
        <div className="space-y-2">
          {items.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex-grow">
                <p className="font-medium">{doc.name}</p>
                {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
              </div>
              <Button asChild variant="outline" size="sm">
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
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2"><Link2 className="w-6 h-6 text-primary" /> Matérias e Links</h3>
        <div className="space-y-2">
          {links.map((link, index) => (
            <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="block p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
              <p className="font-medium text-primary">{link.title}</p>
              <p className="text-sm text-muted-foreground truncate">{link.url}</p>
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

      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8 flex justify-between items-center">
            <Button asChild variant="ghost">
              <Link to="/obras-publicas"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar para todas as obras</Link>
            </Button>
            <Button variant="outline" onClick={handleFavoriteToggle} className="gap-2">
              <Star className={`w-4 h-4 transition-colors ${isFavorited ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
              {isFavorited ? 'Favoritado' : 'Favoritar'}
            </Button>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="bg-muted/50 p-6">
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    {work.work_category?.name && <span className="text-sm font-semibold bg-primary/10 text-primary px-2 py-1 rounded">{work.work_category.name}</span>}
                    {work.work_area?.name && <span className="flex items-center gap-2 text-sm font-semibold bg-secondary text-secondary-foreground px-2 py-1 rounded"><AreaIcon className="w-4 h-4" /> {work.work_area.name}</span>}
                  </div>
                  <CardTitle className="text-3xl font-bold text-tc-red">{work.title}</CardTitle>
                  {work.description && <CardDescription className="mt-2 text-lg">{work.description}</CardDescription>}
                </div>
                <div className={`flex-shrink-0 flex items-center gap-2 text-lg font-semibold p-2 rounded-md ${statusInfo.color}`}>
                  <statusInfo.icon className="h-6 w-6" />
                  <span>{statusInfo.text}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {work.execution_percentage > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">Progresso da Obra</span>
                    <span className="font-bold text-tc-red">{work.execution_percentage}%</span>
                  </div>
                  <Progress value={work.execution_percentage} className="h-3" />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {details.map((detail, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-md">
                      <detail.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{detail.label}</p>
                      <p className="font-semibold">{detail.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-6">Galeria e Documentos</h2>
                {media.length > 0 || (work.related_links && work.related_links.length > 0) ? (
                  <>
                    <MediaSection title="Fotos" items={photos} icon={ImageIcon} onOpen={openViewer} />
                    <MediaSection title="Vídeos" items={videos} icon={Video} onOpen={openViewer} />
                    <DocumentSection items={documents} />
                    <RelatedLinksSection links={work.related_links} />
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">Nenhuma mídia, documento ou link disponível para esta obra.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default WorkDetailsPage;