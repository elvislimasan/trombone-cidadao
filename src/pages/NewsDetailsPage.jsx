import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Calendar, User, Share2, Send, MessageSquare, Video, Image as ImageIcon, MapPin, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import MediaViewer from '@/components/MediaViewer';
import { supabase } from '@/lib/customSupabaseClient';
import { getNewsShareUrl } from '@/lib/shareUtils';

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
      .select('work:public_works(id, title, status, thumbnail_url, address, bairro:bairros(name))')
      .eq('news_id', newsId);
    if (!relError && relData) {
      const works = relData.map(r => r.work).filter(Boolean);
      setRelatedWorks(works);
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
  }, [newsId, toast, navigate]);

  useEffect(() => {
    fetchNewsDetails();
  }, [fetchNewsDetails]);

  const handleShare = async () => {
    const shareUrl = getNewsShareUrl(newsItem.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: newsItem.title, url: shareUrl });
        toast({ title: "Compartilhado com sucesso! 📣" });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copiado! 📋", description: "O link da notícia foi copiado." });
      }
    } catch (error) {
      toast({ title: "Erro ao compartilhar", variant: "destructive" });
    }
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
            <Link to="/noticias" className="text-sm text-primary hover:underline mb-4 block">&larr; Voltar para todas as notícias</Link>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight mb-4">{newsItem.title}</h1>
            {newsItem.subtitle && (
              <p className="text-lg text-muted-foreground mb-4">{newsItem.subtitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
              <div className="flex items-center gap-2"><User className="w-4 h-4" /> {newsItem.source}</div>
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {new Date(newsItem.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
              {newsItem.link && (
                <a href={newsItem.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                  Ver na fonte <ArrowUpRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </header>

          <motion.div className="mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <img src={newsItem.image_url} alt={newsItem.title} className="w-full rounded-2xl shadow-lg aspect-video object-cover" />
          </motion.div>

          <div ref={bodyRef} className="prose prose-lg dark:prose-invert max-w-none text-foreground/90 mb-12" dangerouslySetInnerHTML={{ __html: renderBodyHtml }} />

          {videoEmbedUrl && (
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
                    <CarouselItem key={item.id} className="pl-4 md:basis-1/2 lg:basis-1/3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      className="group flex items-center gap-3 p-3 rounded-xl border bg-white hover:border-primary/50 hover:bg-primary/5 transition-colors shadow-sm"
                    >
                      <div className="w-24 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {w.thumbnail_url ? (
                          <img src={w.thumbnail_url} alt={w.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sem imagem</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold leading-tight text-slate-900 truncate">{w.title}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusStyles}`}>
                            {statusText}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{locationText}</span>
                          </span>
                        </div>
                      </div>
                      <div className="self-center">
                        <div className="w-8 h-8 rounded-full border bg-white flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary transition-colors">
                          <ArrowUpRight className="w-4 h-4" />
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
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Petições relacionadas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {relatedPetitions.map((p) => (
                  <Link
                    key={p.id}
                    to={`/abaixo-assinado/${p.id}`}
                    className="group flex items-center gap-3 p-3 rounded-xl border bg-white hover:border-primary/50 hover:bg-primary/5 transition-colors shadow-sm"
                  >
                    <div className="w-24 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Sem imagem</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold leading-tight text-slate-900 truncate">{p.title}</p>
                      {p.status && (
                        <span className="mt-2 inline-block text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                          {p.status === 'open' ? 'Aberta' : p.status === 'victory' ? 'Vitória' : p.status === 'closed' ? 'Encerrada' : 'Rascunho'}
                        </span>
                      )}
                    </div>
                    <div className="self-center">
                      <div className="w-8 h-8 rounded-full border bg-white flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary transition-colors">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end mb-12">
            <Button onClick={handleShare} variant="outline" className="gap-2"><Share2 className="w-4 h-4" /> Compartilhar Notícia</Button>
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
    </>
  );
};

export default NewsDetailsPage;
