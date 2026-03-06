import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Combobox } from '@/components/ui/combobox';
import { ImageIcon, Video, Paperclip, FolderOpen, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export const WorkMediaManager = ({ workId }) => {
  const { user } = useAuth();
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [galleryName, setGalleryName] = useState('');
  const [isNewGallery, setIsNewGallery] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  
  const fetchMedia = useCallback(async () => {
    if (!workId) return;
    const { data, error } = await supabase.from('public_work_media').select('*').eq('work_id', workId).order('created_at');
    if (error) toast({ title: "Erro ao buscar mídias", variant: "destructive" });
    else setMedia(data);
  }, [workId, toast]);

  // Extract unique gallery names
  const existingGalleries = Array.from(new Set(media.map(m => m.gallery_name).filter(Boolean))).sort();

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const uploadSingleFile = async (file) => {
    let uploadFile = file;
    // Removido conversão para webp para evitar erros de MIME type no Supabase
    
    const filePath = `works/${workId}/${Date.now()}-${uploadFile.name}`;
    const { error: uploadError } = await supabase.storage.from('work-media').upload(filePath, uploadFile);
    
    if (uploadError) {
      toast({ title: `Erro no upload de ${file.name}`, description: uploadError.message, variant: "destructive" });
      return;
    }
    
    const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(filePath);
    
    let fileType = 'file';
    if (file.type.startsWith('image')) fileType = 'image';
    else if (file.type.startsWith('video')) fileType = 'video';
    else if (file.type === 'application/pdf') fileType = 'pdf';

    const { error: dbError } = await supabase.from('public_work_media').insert({
      work_id: workId,
      url: publicUrl,
      type: fileType,
      name: file.name,
      status: 'approved',
      contributor_id: user?.id || null,
      gallery_name: galleryName || null
    });

    if (dbError) {
      toast({ title: `Erro ao salvar ${file.name}`, description: dbError.message, variant: "destructive" });
    }
  };

  const deleteMedia = async (mediaId, mediaUrl) => {
    const { error: dbError } = await supabase.from('public_work_media').delete().eq('id', mediaId);
    if (dbError) {
      toast({ title: "Erro ao remover mídia do banco", variant: "destructive" });
      return;
    }
    
    try {
      const filePath = new URL(mediaUrl).pathname.split('/work-media/')[1];
      if (filePath) {
        await supabase.storage.from('work-media').remove([decodeURIComponent(filePath)]);
      }
    } catch (e) {
      // Erro ao parsear ou deletar arquivo do storage
    }

    toast({ title: "Mídia removida!" });
    fetchMedia();
  };
  
  const getFileIcon = (type) => {
    switch(type) {
      case 'image': return <ImageIcon className="w-10 h-10 text-gray-500" />;
      case 'video': return <Video className="w-10 h-10 text-gray-500" />;
      case 'pdf': return <Paperclip className="w-10 h-10 text-red-500" />;
      default: return <Paperclip className="w-10 h-10 text-gray-500" />;
    }
  }

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploading(true);
      const toUpload = Array.from(files);
      try {
        await Promise.all(toUpload.map(file => uploadSingleFile(file)));
        toast({ title: "Upload concluído!", description: "Os arquivos foram enviados." });
        fetchMedia();
        // Reset gallery selection if needed, or keep it for continuous upload
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    }
  };

  // Group media by gallery
  const groupedMedia = media.reduce((acc, item) => {
    const key = item.gallery_name || 'Sem Galeria';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const handleGalleryChange = (value) => {
    if (value === 'new_gallery_option') {
      setGalleryName('');
      setIsNewGallery(true);
    } else {
      setGalleryName(value === 'no_gallery_option' ? '' : value);
      setIsNewGallery(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <CardTitle>Mídias e Arquivos</CardTitle>
          <CardDescription>Gerencie fotos, vídeos e documentos da obra.</CardDescription>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full xl:w-auto bg-muted/30 p-2 rounded-lg border border-border/50 flex-wrap">
          <div className="flex-1 w-full sm:min-w-[200px]">
            <Combobox 
              value={isNewGallery ? 'new_gallery_option' : (galleryName || 'no_gallery_option')} 
              onChange={handleGalleryChange}
              options={[
                { value: 'no_gallery_option', label: 'Sem Galeria (Geral)' },
                ...existingGalleries.map(g => ({ value: g, label: g })),
                { value: 'new_gallery_option', label: '+ Nova Galeria' }
              ]}
              placeholder="Selecione a galeria"
              searchPlaceholder="Buscar galeria..."
            />
          </div>

          {isNewGallery && (
            <Input 
              placeholder="Nome da nova galeria" 
              value={galleryName}
              onChange={(e) => setGalleryName(e.target.value)}
              className="w-full sm:w-[200px] bg-background"
              autoFocus
            />
          )}
          
          <Button variant="default" onClick={() => fileInputRef.current.click()} disabled={uploading} className="w-full sm:w-auto whitespace-nowrap">
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Enviando...' : 'Adicionar Mídia'}
          </Button>
        </div>
        <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,video/*,application/pdf" />
      </CardHeader>
      
      <CardContent className="space-y-8">
        {media.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/10">
            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma mídia adicionada a esta obra.</p>
            <Button variant="link" onClick={() => fileInputRef.current.click()}>Adicionar agora</Button>
          </div>
        ) : (
          Object.entries(groupedMedia).sort((a, b) => {
            if (a[0] === 'Sem Galeria') return -1;
            if (b[0] === 'Sem Galeria') return 1;
            return a[0].localeCompare(b[0]);
          }).map(([groupName, items]) => (
            <div key={groupName} className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  {groupName === 'Sem Galeria' ? <ImageIcon className="w-4 h-4 text-muted-foreground" /> : <FolderOpen className="w-4 h-4 text-primary" />}
                  {groupName}
                </h3>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length} itens</span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {items.map(m => (
                  <Card key={m.id} className="relative group overflow-hidden border-muted hover:border-primary/50 transition-colors">
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex aspect-square bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden">
                      {m.type === 'image' ? (
                        <img src={m.url} alt={m.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        getFileIcon(m.type)
                      )}
                    </a>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate" title={m.name}>{m.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {new Date(m.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-md" 
                      onClick={(e) => {
                        e.preventDefault();
                        deleteMedia(m.id, m.url);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
};
