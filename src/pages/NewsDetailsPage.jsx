import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Calendar, User, Share2, Send, MessageSquare, Video, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import MediaViewer from '@/components/MediaViewer';
import { supabase } from '@/lib/customSupabaseClient';

const NewsDetailsPage = () => {
  const { newsId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [newsItem, setNewsItem] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [mediaViewerState, setMediaViewerState] = useState({ isOpen: false, startIndex: 0 });

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
  }, [newsId, toast, navigate]);

  useEffect(() => {
    fetchNewsDetails();
  }, [fetchNewsDetails]);

  const handleShare = async () => {
    const shareData = {
      title: newsItem.title,
      text: `Confira esta notícia no Trombone Cidadão: "${newsItem.title}"`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast({ title: "Compartilhado com sucesso! 📣" });
      } else {
        await navigator.clipboard.writeText(shareData.url);
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
    return match ? `${url}embed` : null;
  };

  const openMediaViewer = (index) => {
    setMediaViewerState({ isOpen: true, startIndex: index });
  };

  if (!newsItem) {
    return <div className="container mx-auto px-4 py-12 text-center">Carregando notícia...</div>;
  }

  const videoEmbedUrl = newsItem.video_url ? (getYoutubeEmbedUrl(newsItem.video_url) || getInstagramEmbedUrl(newsItem.video_url)) : null;
  const galleryMedia = (newsItem.gallery || []).map(url => ({ url, type: 'photo' }));

  return (
    <>
      <Helmet>
        <title>{`${newsItem.title} - Trombone Cidadão`}</title>
        <meta name="description" content={newsItem.description} />
      </Helmet>
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <motion.article initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <header className="mb-8">
            <Link to="/noticias" className="text-sm text-primary hover:underline mb-4 block">&larr; Voltar para todas as notícias</Link>
            <h1 className="text-3xl md:text-5xl font-bold text-foreground leading-tight mb-4">{newsItem.title}</h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
              <div className="flex items-center gap-2"><User className="w-4 h-4" /> {newsItem.source}</div>
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {new Date(newsItem.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
            </div>
          </header>

          <motion.div className="mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <img src={newsItem.image_url} alt={newsItem.title} className="w-full rounded-2xl shadow-lg aspect-video object-cover" />
          </motion.div>

          <div className="prose prose-lg dark:prose-invert max-w-none text-foreground/90 mb-12" dangerouslySetInnerHTML={{ __html: newsItem.body?.replace(/\n/g, '<br />') || '' }} />

          {videoEmbedUrl && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Video className="w-6 h-6 text-primary" /> Vídeo</h2>
              <div className="aspect-video rounded-xl overflow-hidden shadow-lg">
                <iframe
                  src={videoEmbedUrl}
                  width="100%"
                  height="100%"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Vídeo incorporado"
                  className="border-0"
                ></iframe>
              </div>
            </div>
          )}

          {galleryMedia.length > 0 && (
            <div className="my-12">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-primary" /> Galeria de Fotos</h2>
              <Carousel className="w-full" opts={{ align: "start", loop: true }}>
                <CarouselContent className="-ml-4">
                  {galleryMedia.map((media, index) => (
                    <CarouselItem key={index} className="pl-4 md:basis-1/2 lg:basis-1/3">
                      <button onClick={() => openMediaViewer(index)} className="w-full aspect-video rounded-lg overflow-hidden border border-border group bg-background flex items-center justify-center relative">
                        <img alt={`Galeria ${index + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" src={media.url} />
                      </button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
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
      {mediaViewerState.isOpen && (
        <MediaViewer
          media={galleryMedia}
          startIndex={mediaViewerState.startIndex}
          onClose={() => setMediaViewerState({ isOpen: false, startIndex: 0 })}
        />
      )}
    </>
  );
};

export default NewsDetailsPage;