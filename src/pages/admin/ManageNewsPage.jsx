import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save, X, Image as ImageIcon, Video, Check, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/lib/customSupabaseClient';

const NewsEditModal = ({ newsItem, onSave, onClose }) => {
  const [formData, setFormData] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [existingGallery, setExistingGallery] = useState([]);
  const [removedGalleryIds, setRemovedGalleryIds] = useState([]);
  const featuredImageInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    if (newsItem) {
      setFormData({
        ...newsItem
      });
      setGalleryFiles([]); // Resetar galeria ao abrir modal
      setRemovedGalleryIds([]);
      
      // Buscar imagens existentes da galeria
      if (newsItem.id) {
        supabase
          .from('news_image')
          .select('*')
          .eq('news_id', newsItem.id)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (!error && data) {
              setExistingGallery(data);
            }
          });
      } else {
        setExistingGallery([]);
      }
    } else {
      setFormData(null);
      setGalleryFiles([]);
      setExistingGallery([]);
      setRemovedGalleryIds([]);
    }
  }, [newsItem]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryChange = (e) => {
    const files = Array.from(e.target.files);
    setGalleryFiles(prev => [...prev, ...files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
    }))]);
  };

  const removeGalleryImage = (index) => {
    setGalleryFiles(prev => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const removeExistingImage = (imageId) => {
    setExistingGallery(prev => prev.filter(img => img.id !== imageId));
    setRemovedGalleryIds(prev => [...prev, imageId]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData, galleryFiles, removedGalleryIds);
  };

  if (!formData) return null;

  return (
    <Dialog open={!!newsItem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">{formData.id ? 'Editar Notícia' : 'Adicionar Nova Notícia'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">Título</Label>
              <Input id="title" name="title" value={formData.title} onChange={handleChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="source" className="text-right">Fonte</Label>
              <Input id="source" name="source" value={formData.source} onChange={handleChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">Data</Label>
              <Input id="date" name="date" type="date" value={formData.date} onChange={handleChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2">Resumo</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="body" className="text-right pt-2">Corpo da Notícia</Label>
              <Textarea id="body" name="body" value={formData.body} onChange={handleChange} className="col-span-3" rows={8} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="video_url" className="text-right">URL do Vídeo</Label>
              <Input id="video_url" name="video_url" value={formData.video_url} onChange={handleChange} className="col-span-3" placeholder="Link do YouTube ou Instagram" />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">Imagem Destaque</Label>
              <div className="col-span-3">
                <input type="file" accept="image/*" ref={featuredImageInputRef} onChange={(e) => handleFileChange(e, 'image_url')} className="hidden" />
                <Button type="button" variant="outline" onClick={() => featuredImageInputRef.current.click()}><ImageIcon className="w-4 h-4 mr-2" /> Selecionar Imagem</Button>
                {formData.image_url && <img src={formData.image_url} alt="Preview" className="mt-2 rounded-md max-h-40" />}
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">Galeria de Imagens</Label>
              <div className="col-span-3">
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple 
                  ref={galleryInputRef} 
                  onChange={handleGalleryChange} 
                  className="hidden" 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => galleryInputRef.current.click()}
                >
                  <ImageIcon className="w-4 h-4 mr-2" /> Adicionar Imagens à Galeria
                </Button>
                
                {/* Imagens existentes */}
                {existingGallery.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Imagens já cadastradas:</p>
                    <div className="flex flex-wrap gap-2">
                      {existingGallery.map((item) => (
                        <div key={item.id} className="relative">
                          <img 
                            src={item.url} 
                            alt={item.name || 'Imagem da galeria'} 
                            className="h-24 w-24 object-cover rounded-md border border-border" 
                          />
                          <Button 
                            type="button" 
                            variant="destructive" 
                            size="icon" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full" 
                            onClick={() => removeExistingImage(item.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Novas imagens (preview) */}
                {galleryFiles.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Novas imagens a adicionar:</p>
                    <div className="flex flex-wrap gap-2">
                      {galleryFiles.map((item, index) => (
                    <div key={index} className="relative">
                          <img 
                            src={item.preview} 
                            alt={`Preview ${index}`} 
                            className="h-24 w-24 object-cover rounded-md border border-border" 
                          />
                          <Button 
                            type="button" 
                            variant="destructive" 
                            size="icon" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full" 
                            onClick={() => removeGalleryImage(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                    </div>
                  ))}
                </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit" className="gap-2"><Save className="w-4 h-4" /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManageNewsPage = () => {
  const { toast } = useToast();
  const [news, setNews] = useState([]);
  const [editingNews, setEditingNews] = useState(null);
  const [deletingNews, setDeletingNews] = useState(null);
  const [pendingComments, setPendingComments] = useState([]);

  const fetchNewsAndComments = useCallback(async () => {
    const { data: newsData, error: newsError } = await supabase.from('news').select('*').order('date', { ascending: false });
    if (newsError) toast({ title: "Erro ao buscar notícias", description: newsError.message, variant: "destructive" });
    else setNews(newsData);

    const { data: commentsData, error: commentsError } = await supabase.from('comments').select('*, news:news(title), author:profiles(name)').eq('moderation_status', 'pending_approval').not('news_id', 'is', null);
    if (commentsError) toast({ title: "Erro ao buscar comentários", description: commentsError.message, variant: "destructive" });
    else setPendingComments(commentsData);
  }, [toast]);

  useEffect(() => {
    fetchNewsAndComments();
  }, [fetchNewsAndComments]);

  const handleSaveNews = async (newsToSave, galleryFiles = [], removedGalleryIds = []) => {
    const { id, comments, ...dataToSave } = newsToSave;
    
    // Remove campos que não existem na tabela news
    // Apenas campos válidos da tabela news serão salvos
    const validFields = ['title', 'source', 'date', 'description', 'body', 'image_url', 'link', 'video_url'];
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
    } else {
      const { data, error: insertError } = await supabase.from('news').insert(filteredData).select().single();
      error = insertError;
      savedNewsId = data?.id;
    }

    if (error) {
      toast({ title: "Erro ao salvar notícia", description: error.message, variant: "destructive" });
      return;
    }

    // Remover imagens marcadas para exclusão
    if (removedGalleryIds.length > 0) {
      for (const imageId of removedGalleryIds) {
        // Buscar URL da imagem para remover do storage
        const { data: imageData } = await supabase
          .from('news_image')
          .select('url')
          .eq('id', imageId)
          .single();

        if (imageData) {
          try {
            const url = new URL(imageData.url);
            const filePath = url.pathname.split('/news-images/')[1];
            if (filePath) {
              await supabase.storage.from('news-images').remove([decodeURIComponent(filePath)]);
            }
          } catch (e) {
            // Erro ao remover arquivo do storage
          }
        }

        // Remover do banco
        await supabase.from('news_image').delete().eq('id', imageId);
      }
    }

    // Upload da galeria após salvar a notícia
    if (savedNewsId && galleryFiles.length > 0) {
      try {
        const uploadPromises = galleryFiles.map(async ({ file }) => {
          const filePath = `news/${savedNewsId}/${Date.now()}-${file.name}`;
          
          // Upload para storage
          const { error: uploadError } = await supabase.storage
            .from('news-images')
            .upload(filePath, file);

          if (uploadError) {
            throw new Error(`Erro no upload de ${file.name}: ${uploadError.message}`);
          }

          // Obter URL pública
          const { data: { publicUrl } } = supabase.storage
            .from('news-images')
            .getPublicUrl(filePath);

          // Salvar no banco
          const { error: dbError } = await supabase
            .from('news_image')
            .insert({
              news_id: savedNewsId,
              url: publicUrl,
              type: 'image',
              name: file.name
            });

          if (dbError) {
            throw new Error(`Erro ao salvar ${file.name}: ${dbError.message}`);
          }
        });

        await Promise.all(uploadPromises);
      } catch (uploadError) {
        toast({ 
          title: "Notícia salva, mas houve erro no upload da galeria", 
          description: uploadError.message, 
          variant: "destructive" 
        });
      }
    }

      toast({ title: `Notícia ${id ? 'atualizada' : 'adicionada'} com sucesso!` });
      fetchNewsAndComments();
    setEditingNews(null);
  };

  const handleAddNew = () => {
    setEditingNews({ id: null, title: '', source: '', date: new Date().toISOString().split('T')[0], image_url: '', link: '#', description: '', body: '', video_url: '' });
  };

  const handleDeleteNews = async (newsId) => {
    // Buscar URLs das imagens da galeria
    const { data: media } = await supabase
      .from('news_image')
      .select('url')
      .eq('news_id', newsId);

    // Remover do storage
    if (media && media.length > 0) {
      const paths = media.map(m => {
        try {
          const url = new URL(m.url);
          return url.pathname.split('/news-images/')[1];
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (paths.length > 0) {
        await supabase.storage.from('news-images').remove(paths);
      }
    }

    // Deletar notícia (cascade deleta registros em news_image)
    const { error } = await supabase.from('news').delete().eq('id', newsId);
    if (error) {
      toast({ title: "Erro ao remover notícia", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notícia removida com sucesso!", variant: "destructive" });
      fetchNewsAndComments();
    }
    setDeletingNews(null);
  };

  const handleCommentModeration = async (commentId, newStatus) => {
    const { error } = await supabase.from('comments').update({ moderation_status: newStatus }).eq('id', commentId);
    if (error) {
      toast({ title: "Erro ao moderar comentário", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Comentário ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'}!` });
      fetchNewsAndComments();
    }
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Notícias - Admin</title>
        <meta name="description" content="Gerencie as notícias e comunicados da plataforma." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Notícias</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite, remova notícias e modere comentários.</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2"><PlusCircle className="w-4 h-4" /> Adicionar Notícia</Button>
        </motion.div>

        <Tabs defaultValue="news">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="news">Notícias Publicadas</TabsTrigger>
            <TabsTrigger value="comments">
              Moderar Comentários {pendingComments.length > 0 && <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">{pendingComments.length}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="news" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Suas Notícias</CardTitle>
                <CardDescription>Gerencie todas as notícias publicadas na plataforma.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {news.map(item => (
                    <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-sm text-muted-foreground">Fonte: {item.source} - Data: {new Date(item.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                      </div>
                      <div className="flex-shrink-0 flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setEditingNews(item)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingNews(item)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="comments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Comentários Pendentes</CardTitle>
                <CardDescription>Aprove ou rejeite os comentários enviados pelos usuários.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingComments.length > 0 ? pendingComments.map(comment => (
                    <div key={comment.id} className="p-4 bg-background rounded-lg border">
                      <p className="text-sm text-muted-foreground">Em <Link to={`/noticias/${comment.news_id}`} className="font-semibold text-primary hover:underline">{comment.news.title}</Link></p>
                      <p className="italic my-2">"{comment.text}"</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{comment.author.name} <span className="text-muted-foreground">em {new Date(comment.created_at).toLocaleString('pt-BR')}</span></p>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" className="text-green-500 hover:text-green-600" onClick={() => handleCommentModeration(comment.id, 'approved')}><Check className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleCommentModeration(comment.id, 'rejected')}><XCircle className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    </div>
                  )) : <p className="text-center text-muted-foreground py-8">Nenhum comentário pendente.</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <NewsEditModal newsItem={editingNews} onSave={handleSaveNews} onClose={() => setEditingNews(null)} />

      <Dialog open={!!deletingNews} onOpenChange={(open) => !open && setDeletingNews(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a notícia "{deletingNews?.title}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteNews(deletingNews.id)}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageNewsPage;