import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Calendar, User, Share2, Send, MessageSquare, Video, Image as ImageIcon, MapPin, ArrowUpRight, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import MediaViewer from '@/components/MediaViewer';
import { supabase } from '@/lib/customSupabaseClient';
import { getNewsShareUrl } from '@/lib/shareUtils';
import { Progress } from '@/components/ui/progress';
import { getNextSignatureGoal } from '@/lib/utils';
import { NewsEditModal } from './admin/ManageNewsPage';
import { Edit } from 'lucide-react';

const NewsDetailsPage = () => {
  const { newsId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [newsItem, setNewsItem] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [gallery, setGallery] = useState([]);
  const [mediaViewerState, setMediaViewerState] = useState({ isOpen: false, startIndex: 0 });
  const [relatedWorks, setRelatedWorks] = useState([]);
  const [relatedPetitions, setRelatedPetitions] = useState([]);
  const [relatedReports, setRelatedReports] = useState([]);
  const [relatedNews, setRelatedNews] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const bodyRef = useRef(null);

  const fetchNewsDetails = useCallback(async () => {
    const { data, error } = await supabase
      .from('news')
      .select('*, comments(*, author:profiles(name, avatar_url))')
      .eq('id', newsId)
      .single();
    
    if (error) {
      toast({ title: "Erro ao buscar notícia", description: error.message, variant: "destructive" });
      navigate('/noticias');
    } else {
      setNewsItem(data);
    }

    // Buscar galeria de imagens
    const { data: mediaData, error: mediaError } = await supabase
      .from('news_image')
      .select('*')
      .eq('news_id', newsId)
      .order('created_at', { ascending: false });

    if (mediaError) {
      toast({ title: "Erro ao buscar galeria", description: mediaError.message, variant: "destructive" });
    } else {
      setGallery(mediaData || []);
    }

    // Buscar obras relacionadas
    const { data: relData, error: relError } = await supabase
      .from('news_public_works')
      .select('work_id')
      .eq('news_id', newsId);
    if (!relError && relData && relData.length > 0) {
      const workIds = relData.map(r => r.work_id).filter(Boolean);
      if (workIds.length > 0) {
        const { data: worksData, error: worksError } = await supabase
          .from('public_works')
          .select('id, title, status, thumbnail_url, address, bairro:bairros(name)')
          .in('id', workIds);
        
        if (!worksError && worksData) {
          // Buscar mídias para cada obra
          const { data: allMedia, error: mediaError } = await supabase
            .from('public_work_media')
            .select('work_id, url, type')
            .in('work_id', workIds);

          
          const works = worksData.map(w => {
            const mediaForWork = allMedia?.filter(m => m.work_id === w.id) || [];
            return {
              ...w,
              image_url: w.thumbnail_url || mediaForWork.find(m => m.type === 'image')?.url || null
            };
          });
          setRelatedWorks(works);
        }
      }
    }

    // Buscar petições relacionadas
    const { data: relPet, error: relPetError } = await supabase
      .from('news_petitions')
      .select('petition:petitions(id, title, image_url, status)')
      .eq('news_id', newsId);
    if (!relPetError && relPet) {
      const petitions = relPet.map(r => r.petition).filter(Boolean);
      setRelatedPetitions(petitions);
    }

    const { data: relRep, error: relRepErr } = await supabase
      .from('news_reports')
      .select('report:reports(id, title, description, address, report_media(*))')
      .eq('news_id', newsId);
    if (!relRepErr && relRep) {
      const reps = relRep.map(r => ({
        ...r.report,
        image_url: (r.report?.report_media || []).find((m) => m.type === 'photo')?.url || null
      })).filter(Boolean);
      setRelatedReports(reps);
    } else if (relRepErr) {
      console.error('Erro ao buscar broncas relacionadas:', relRepErr);
    }

    // Buscar notícias relacionadas (bidirecional)
    const { data: relNews, error: relNewsErr } = await supabase
      .from('news_related')
      .select(`
        news_id,
        related_news_id,
        news!news_id(id, title, image_url, date, description),
        related:news!related_news_id(id, title, image_url, date, description)
      `)
      .or(`news_id.eq.${newsId},related_news_id.eq.${newsId}`);
    
    if (!relNewsErr && relNews) {
      const list = relNews.map(r => {
        // Se a notícia atual é a news_id, o relacionado é o related_news_id (aliased as 'related')
        // Se a notícia atual é a related_news_id, o relacionado é o news_id (aliased as 'news')
        return r.news_id === newsId ? r.related : r.news;
      }).filter(Boolean);
      
      // Remover duplicatas (caso existam links em ambos os sentidos)
      const uniqueList = Array.from(new Map(list.map(n => [n.id, n])).values());
      setRelatedNews(uniqueList);
    } else if (relNewsErr) {
      console.error('Erro ao buscar notícias relacionadas:', relNewsErr);
    }
  }, [newsId, toast, navigate]);

  useEffect(() => {
    fetchNewsDetails();
  }, [fetchNewsDetails]);

  const handleWhatsAppShare = () => {
    const shareUrl = getNewsShareUrl(newsItem.id);
    const shareText = `*Trombone Cidadão*\n\n*${newsItem.title}*\n\nVeja em:\n${shareUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleShare = async () => {
    const shareUrl = getNewsShareUrl(newsItem.id);
    // Formatar texto para incluir "Trombone Cidadão", título completo e link "Veja em"
    // Usando * para negrito (formato WhatsApp/Telegram)
    const shareText = `*Trombone Cidadão*\n\n*${newsItem.title}*\n\nVeja em:\n${shareUrl}`;
    
    try {
      if (navigator.share) {
        await navigator.share({ 
          title: newsItem.title, 
          text: shareText
        });
        toast({ title: "Compartilhado com sucesso! 📣" });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Texto copiado! 📋", description: "O link e título foram copiados para sua área de transferência." });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        toast({ title: "Erro ao compartilhar", variant: "destructive" });
      }
    }
  };

  const handleSaveNews = async (newsToSave, galleryFiles = [], removedGalleryIds = [], sendNotification = false, relatedReportIds = [], relatedWorkIds = [], relatedPetitionIds = [], relatedNewsIds = []) => {
    const { id, comments, ...dataToSave } = newsToSave;
    const validFields = ['title', 'source', 'date', 'description', 'subtitle', 'body', 'image_url', 'link', 'video_url'];
    const filteredData = Object.keys(dataToSave)
      .filter(key => validFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = dataToSave[key];
        return obj;
      }, {});
    
    let error;
    let savedNewsId;

    if (id) {
      ({ error } = await supabase.from('news').update(filteredData).eq('id', id));
      savedNewsId = id;
    }

    if (error) {
      toast({ title: "Erro ao salvar notícia", description: error.message, variant: "destructive" });
      return;
    }

    // Atualizar vínculos
    if (savedNewsId) {
      await Promise.all([
        supabase.from('news_public_works').delete().eq('news_id', savedNewsId),
        supabase.from('news_petitions').delete().eq('news_id', savedNewsId),
        supabase.from('news_reports').delete().eq('news_id', savedNewsId),
        supabase.from('news_related').delete().eq('news_id', savedNewsId)
      ]);

      if (relatedWorkIds?.length > 0) {
        await supabase.from('news_public_works').insert(relatedWorkIds.map(wid => ({ news_id: savedNewsId, work_id: wid })));
      }
      if (relatedPetitionIds?.length > 0) {
        await supabase.from('news_petitions').insert(relatedPetitionIds.map(pid => ({ news_id: savedNewsId, petition_id: pid })));
      }
      if (relatedReportIds?.length > 0) {
        await supabase.from('news_reports').insert(relatedReportIds.map(rid => ({ news_id: savedNewsId, report_id: rid })));
      }
      if (relatedNewsIds?.length > 0) {
        await supabase.from('news_related').insert(relatedNewsIds.map(rnid => ({ news_id: savedNewsId, related_news_id: rnid })));
      }
    }

    // Remover imagens
    if (removedGalleryIds?.length > 0) {
      for (const imageId of removedGalleryIds) {
        const { data: imageData } = await supabase.from('news_image').select('url').eq('id', imageId).single();
        if (imageData) {
          try {
            const url = new URL(imageData.url);
            const filePath = url.pathname.split('/news-images/')[1];
            if (filePath) await supabase.storage.from('news-images').remove([decodeURIComponent(filePath)]);
          } catch (e) {}
        }
        await supabase.from('news_image').delete().eq('id', imageId);
      }
    }

    // Upload galeria
    if (savedNewsId && galleryFiles?.length > 0) {
      const uploadPromises = galleryFiles.map(async ({ file }) => {
        let uploadFile = file;
        const filePath = `news/${savedNewsId}/${Date.now()}-${uploadFile.name}`;
        const { error: uploadError } = await supabase.storage.from('news-images').upload(filePath, uploadFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('news-images').getPublicUrl(filePath);
        await supabase.from('news_image').insert({ news_id: savedNewsId, url: publicUrl, type: 'image', name: uploadFile.name });
      });
      await Promise.all(uploadPromises);
    }

    toast({ title: "Notícia atualizada com sucesso! ✨" });
    setShowEditModal(false);
    fetchNewsDetails();
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!user) {
      toast({ title: "Faça login para comentar", description: "Você precisa estar logado para adicionar um comentário.", variant: "destructive" });
      return;
    }
    
    const { error } = await supabase
      .from('comments')
      .insert({
        report_id: null, // This is a news comment, not a report comment
        news_id: newsId, // You'll need to add a news_id column to your comments table
        author_id: user.id,
        text: newComment,
        moderation_status: 'pending_approval'
      });

    if (error) {
      toast({ title: "Erro ao enviar comentário", description: error.message, variant: "destructive" });
    } else {
      setNewComment('');
      toast({ title: "Comentário enviado! 💬", description: "Seu comentário foi enviado para moderação." });
      // Optionally refetch comments or optimistically update UI
    }
  };

  const getYoutubeEmbedUrl = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  const getInstagramEmbedUrl = (url) => {
    if (!url) return null;
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/`;
  };

  const openMediaViewer = (index) => {
    const galleryMedia = gallery.map(item => ({ url: item.url, type: 'photo' }));
    setMediaViewerState({ isOpen: true, startIndex: index, items: galleryMedia });
  };

  const renderBodyHtml = useMemo(() => {
    let html = newsItem?.body || '';
    if (!html) return '';
    if (!/<a\s/i.test(html)) {
      html = html.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline font-semibold break-all">${url}</a>`;
      });
    }
    html = html.replace(/\n/g, '<br />');
    return html;
  }, [newsItem?.body]);

  useEffect(() => {
    if (!bodyRef.current) return;
    const anchors = bodyRef.current.querySelectorAll('a');
    anchors.forEach(a => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.classList.add('text-primary','underline','font-semibold','break-all');
    });
  }, [renderBodyHtml]);

  const videoEmbedUrl = newsItem?.video_url ? (getYoutubeEmbedUrl(newsItem?.video_url) || getInstagramEmbedUrl(newsItem?.video_url)) : null;
  const isInstagram = !!(newsItem?.video_url && /instagram\.com/.test(newsItem.video_url));
  useEffect(() => {
    if (!isInstagram || !videoEmbedUrl) return;
    const existing = document.getElementById('instagram-embed');
    if (!existing) {
      const s = document.createElement('script');
      s.id = 'instagram-embed';
      s.src = 'https://www.instagram.com/embed.js';
      s.async = true;
      document.body.appendChild(s);
    } else {
      if (window.instgrm && window.instgrm.Embeds && window.instgrm.Embeds.process) {
        window.instgrm.Embeds.process();
      }
    }
  }, [isInstagram, videoEmbedUrl]);

  if (!newsItem) {
    return <div className="container mx-auto px-4 py-12 text-center">Carregando notícia...</div>;
  }


  return (
    <>
      <Helmet>
        <title>{`${newsItem.title} - Trombone Cidadão`}</title>
        <meta name="description" content={newsItem.subtitle || newsItem.description || ''} />
        <meta property="og:title" content={newsItem.title} />
        <meta property="og:description" content={newsItem.subtitle || newsItem.description || ''} />
        <meta property="og:image" content={newsItem.image_url || ''} />
        <meta property="og:type" content="article" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content={newsItem.title} />
        <meta property="twitter:description" content={newsItem.subtitle || newsItem.description || ''} />
        <meta property="twitter:image" content={newsItem.image_url || ''} />
      </Helmet>
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <motion.article initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <header className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <Link to="/noticias" className="text-sm text-primary hover:underline">&larr; Voltar para todas as notícias</Link>
              {user?.is_admin && (
                <Button 
                  onClick={() => setShowEditModal(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-slate-600 border-slate-200 hover:bg-slate-50"
                >
                  <Edit className="w-4 h-4" />
                  Editar Notícia
                </Button>
              )}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight mb-4">{newsItem.title}</h1>
            {newsItem.subtitle && (
              <p className="text-lg text-muted-foreground mb-4">{newsItem.subtitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
               <a href={newsItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                 <div className="flex items-center gap-2"><User className="w-4 h-4" /> {newsItem.source}</div>
                </a>

              </div>
          </header>

          <motion.div className="mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <img
              src={newsItem.image_url}
              alt={newsItem.title}
              className="w-full h-auto rounded-2xl shadow-lg"
              loading="lazy"
            />
          </motion.div>

          <div ref={bodyRef} className="prose prose-lg dark:prose-invert max-w-none text-foreground/90 mb-12" dangerouslySetInnerHTML={{ __html: renderBodyHtml }} />

          {videoEmbedUrl && videoEmbedUrl.trim() !== '' && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Video className="w-6 h-6 text-primary" /> Vídeo</h2>
              {isInstagram ? (
                <div className="w-full max-w-[560px] rounded-xl shadow-lg overflow-visible">
                  <blockquote 
                    className="instagram-media w-full" 
                    data-instgrm-permalink={videoEmbedUrl} 
                    data-instgrm-version="14"
                    style={{ maxWidth: '100%', margin: 0 }}
                  ></blockquote>
                 
                </div>
              ) : (
                <div className="aspect-video rounded-xl overflow-hidden shadow-lg">
                  <iframe
                    src={videoEmbedUrl}
                    width="100%"
                    height="100%"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="no-referrer"
                    allowFullScreen
                    title="Vídeo incorporado"
                    className="border-0"
                  ></iframe>
                </div>
              )}
            </div>
          )}

          {gallery.length > 0 && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Galeria de Fotos</h2>
              <Carousel className="w-full" opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {gallery.map((item, index) => (
                    <CarouselItem key={item.id} className="pl-4 md:basis-1/2">
                      <button onClick={() => openMediaViewer(index)} className="w-full aspect-video rounded-lg overflow-hidden border border-border group bg-background flex items-center justify-center relative">
                        <img alt={item.name || `Galeria ${index + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" src={item.url} />
                      </button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>
          )}

          {relatedWorks.length > 0 && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Obras relacionadas</h2>
              <Carousel className="w-full hidden md:block" opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {relatedWorks.map((w) => {
                    const statusText = ({
                      'planned': 'Prevista',
                      'tendered': 'Licitada',
                      'in-progress': 'Em Andamento',
                      'stalled': 'Paralisada',
                      'unfinished': 'Inacabada',
                      'completed': 'Concluída',
                    }[w.status]) || 'N/A';
                    const statusStyles = ({
                      'planned': 'text-violet-700 bg-violet-50',
                      'tendered': 'text-orange-700 bg-orange-50',
                      'in-progress': 'text-blue-700 bg-blue-50',
                      'stalled': 'text-amber-700 bg-amber-50',
                      'unfinished': 'text-rose-700 bg-rose-50',
                      'completed': 'text-emerald-700 bg-emerald-50',
                    }[w.status]) || 'text-slate-700 bg-slate-100';
                    const locationText = w.address || (w.bairro && w.bairro.name) || 'Local não informado';
                    return (
                      <CarouselItem key={w.id} className="pl-4 md:basis-1/2">
                        <Link
                          to={`/obras-publicas/${w.id}`}
                          className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden hover:shadow-md transition h-full"
                        >
                          <div className="relative h-40 w-full overflow-hidden bg-muted">
              { w.thumbnail_url ||w.image_url ? (
                            <img src={ w.thumbnail_url || w.image_url } alt={w.title} className="w-full h-full object-cover" />
                          ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sem imagem</div>
                            )}
                          </div>
                          <div className="p-4 flex flex-col flex-1">
                            <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                              {w.title}
                            </h3>
                            <div className="flex items-center gap-2 mb-4">
                              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusStyles}`}>
                                {statusText}
                              </span>
                            </div>
                            <div className="mt-auto flex items-center justify-between pt-2 border-t">
                              <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{locationText}</span>
                              </span>
                              <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1 flex-shrink-0">
                                Ver mais <ArrowUpRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        </Link>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
                {relatedWorks.map((w) => {
                  const statusText = ({
                    'planned': 'Prevista',
                    'tendered': 'Licitada',
                    'in-progress': 'Em Andamento',
                    'stalled': 'Paralisada',
                    'unfinished': 'Inacabada',
                    'completed': 'Concluída',
                  }[w.status]) || 'N/A';
                  const statusStyles = ({
                    'planned': 'text-violet-700 bg-violet-50',
                    'tendered': 'text-orange-700 bg-orange-50',
                    'in-progress': 'text-blue-700 bg-blue-50',
                    'stalled': 'text-amber-700 bg-amber-50',
                    'unfinished': 'text-rose-700 bg-rose-50',
                    'completed': 'text-emerald-700 bg-emerald-50',
                  }[w.status]) || 'text-slate-700 bg-slate-100';
                  const locationText = w.address || (w.bairro && w.bairro.name) || 'Local não informado';
                  return (
                    <Link
                      key={w.id}
                      to={`/obras-publicas/${w.id}`}
                      className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden hover:shadow-md transition h-full"
                    >
                      <div className="relative h-40 w-full overflow-hidden bg-muted">
                        {w.thumbnail_url ? (
                          <img src={w.thumbnail_url} alt={w.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sem imagem</div>
                        )}
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                          {w.title}
                        </h3>
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusStyles}`}>
                            {statusText}
                          </span>
                        </div>
                        <div className="mt-auto flex items-center justify-between pt-2 border-t">
                          <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{locationText}</span>
                          </span>
                          <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1 flex-shrink-0">
                            Ver mais <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {relatedPetitions.length > 0 && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Megaphone className="w-6 h-6 text-primary" /> Petições relacionadas</h2>
              <Carousel className="w-full hidden md:block" opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {relatedPetitions.map((p) => {
                    const signatures = Array.isArray(p.signatures) && p.signatures[0]?.count ? p.signatures[0].count : (p.signatureCount || 0);
                    const rawGoal = Number(p.goal);
                    const baseGoal = Number.isFinite(rawGoal) && rawGoal > 0 ? rawGoal : 100;
                    const displayGoal = getNextSignatureGoal(signatures, baseGoal);
                    const progress = Math.min((signatures / displayGoal) * 100, 100);
                    return (
                      <CarouselItem key={p.id} className="pl-4 md:basis-1/2">
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className="w-full h-full flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden h-full"
                        >
                          <div className="relative h-40 w-full overflow-hidden bg-muted">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-[#FEF2F2] flex items-center justify-center">
                                <Megaphone className="w-8 h-8 text-[#F97316]" />
                              </div>
                            )}
                          </div>
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                              <span className="font-semibold text-[#F97316] flex items-center gap-1">
                                <Megaphone className="w-3 h-3" />
                                Petição Ativa
                              </span>
                            </div>
                            <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                              {p.title}
                            </h3>
                            {p.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{p.description}</p>
                            )}
                            <div className="mt-auto">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
                                <span>{signatures} assinaturas</span>
                                <span>Meta {displayGoal}</span>
                              </div>
                              <Progress value={progress} className="h-1.5 bg-[#F3F4F6] [&>div]:bg-tc-red rounded-full mb-3" />
                              <Button
                                className="w-full h-9 text-xs md:text-sm font-semibold bg-tc-red hover:bg-tc-red/90 rounded-full"
                                onClick={() => navigate(`/abaixo-assinado/${p.id}`)}
                              >
                                Assinar abaixo-assinado
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
                {relatedPetitions.map((p) => {
                  const signatures = Array.isArray(p.signatures) && p.signatures[0]?.count ? p.signatures[0].count : (p.signatureCount || 0);
                  const rawGoal = Number(p.goal);
                  const baseGoal = Number.isFinite(rawGoal) && rawGoal > 0 ? rawGoal : 100;
                  const displayGoal = getNextSignatureGoal(signatures, baseGoal);
                  const progress = Math.min((signatures / displayGoal) * 100, 100);
                  return (
                    <div
                      key={p.id}
                      className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden h-full"
                    >
                      <div className="relative h-40 w-full overflow-hidden bg-muted">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#FEF2F2] flex items-center justify-center">
                            <Megaphone className="w-8 h-8 text-[#F97316]" />
                          </div>
                        )}
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                          <span className="font-semibold text-[#F97316] flex items-center gap-1">
                            <Megaphone className="w-3 h-3" />
                            Petição Ativa
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                          {p.title}
                        </h3>
                        {p.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{p.description}</p>
                        )}
                        <div className="mt-auto">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
                            <span>{signatures} assinaturas</span>
                            <span>Meta {displayGoal}</span>
                          </div>
                          <Progress value={progress} className="h-1.5 bg-[#F3F4F6] [&>div]:bg-tc-red rounded-full mb-3" />
                          <Button
                            className="w-full h-9 text-xs md:text-sm font-semibold bg-tc-red hover:bg-tc-red/90 rounded-full"
                            onClick={() => navigate(`/abaixo-assinado/${p.id}`)}
                          >
                            Apoiar Agora
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {relatedReports.length > 0 && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Broncas relacionadas</h2>
              <Carousel className="w-full hidden md:block" opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {relatedReports.map((r) => (
                    <CarouselItem key={r.id} className="pl-4 md:basis-1/2">
                      <Link
                        to={`/bronca/${r.id}`}
                        className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden hover:shadow-md transition h-full"
                      >
                        <div className="relative h-40 w-full overflow-hidden bg-muted">
                          {r.image_url ? (
                            <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                              <span className="text-3xl">📍</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                            {r.title}
                          </h3>
                          {r.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{r.description}</p>
                          )}
                          <div className="mt-auto flex items-center justify-between pt-2 border-t">
                            {r.address && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{r.address}</span>
                              </p>
                            )}
                            <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1 flex-shrink-0">
                              Ver mais <ArrowUpRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
                {relatedReports.map((r) => (
                  <Link
                    key={r.id}
                    to={`/bronca/${r.id}`}
                    className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden hover:shadow-md transition h-full"
                  >
                    <div className="relative h-40 w-full overflow-hidden bg-muted">
                      {r.image_url ? (
                        <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                          <span className="text-3xl">📍</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                        {r.title}
                      </h3>
                      {r.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{r.description}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-2 border-t">
                        {r.address && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{r.address}</span>
                          </p>
                        )}
                        <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1 flex-shrink-0">
                          Ver mais <ArrowUpRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {relatedNews.length > 0 && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Notícias relacionadas</h2>
              <Carousel className="w-full hidden md:block" opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {relatedNews.map((n) => (
                    <CarouselItem key={n.id} className="pl-4 md:basis-1/2">
                      <Link
                        to={`/noticias/${n.id}`}
                        className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden hover:shadow-md transition h-full"
                      >
                        <div className="relative h-40 w-full overflow-hidden bg-muted">
                          {n.image_url ? (
                            <img src={n.image_url} alt={n.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-100" />
                          )}
                        </div>
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                            {n.title}
                          </h3>
                          {n.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{n.description}</p>
                          )}
                          <div className="mt-auto flex items-center justify-between pt-2 border-t">
                            {n.date && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(n.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                              </p>
                            )}
                            <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1">
                              Ver mais <ArrowUpRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
                {relatedNews.map((n) => (
                  <Link
                    key={n.id}
                    to={`/noticias/${n.id}`}
                    className="group flex flex-col rounded-2xl bg-white border border-[#F3F4F6] shadow-sm overflow-hidden hover:shadow-md transition h-full"
                  >
                    <div className="relative h-40 w-full overflow-hidden bg-muted">
                      {n.image_url ? (
                        <img src={n.image_url} alt={n.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100" />
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2">
                        {n.title}
                      </h3>
                      {n.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{n.description}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-2 border-t">
                        {n.date && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(n.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          </p>
                        )}
                        <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1">
                          Ver mais <ArrowUpRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 mb-12">
            <Button 
              onClick={handleWhatsAppShare} 
              variant="outline" 
              className="gap-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <svg 
                viewBox="0 0 24 24" 
                className="w-4 h-4 fill-current" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.347-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.87 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </Button>
            <Button onClick={handleShare} variant="outline" className="gap-2">
              <Share2 className="w-4 h-4" /> 
              Outras Opções
            </Button>
          </div>

          <Card className="bg-card/50">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><MessageSquare className="w-6 h-6 text-primary" /> Comentários</h2>
              <div className="space-y-6 mb-8">
                {(newsItem.comments || []).filter(c => c.moderation_status === 'approved').length > 0 ? (
                  (newsItem.comments || []).filter(c => c.moderation_status === 'approved').map(comment => (
                    <div key={comment.id} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold flex-shrink-0">{comment.author.name.charAt(0)}</div>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <p className="font-semibold text-foreground">{comment.author.name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <p className="text-muted-foreground mt-1">{comment.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-4">Seja o primeiro a comentar!</p>
                )}
              </div>
              <form onSubmit={handleSubmitComment} className="flex gap-4">
                <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Deixe seu comentário..." className="flex-1 bg-background px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" disabled={!user} />
                <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90" disabled={!user}><Send className="w-4 h-4" /></Button>
              </form>
              {!user && <p className="text-xs text-muted-foreground mt-2">Você precisa <Link to="/login" className="text-primary hover:underline">fazer login</Link> para comentar.</p>}
            </CardContent>
          </Card>
        </motion.article>
      </div>
      {mediaViewerState.isOpen && mediaViewerState.items && (
        <MediaViewer
          media={mediaViewerState.items}
          startIndex={mediaViewerState.startIndex}
          onClose={() => setMediaViewerState({ isOpen: false, startIndex: 0, items: [] })}
        />
      )}

      {showEditModal && newsItem && (
        <NewsEditModal
          newsItem={newsItem}
          onSave={handleSaveNews}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
};

export default NewsDetailsPage;
