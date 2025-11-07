import React, { useState, useRef, lazy, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, Video, Trash2, MapPin, Image as ImageIcon, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { FLORESTA_COORDS } from '@/config/mapConfig';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const compressImage = (file, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar a imagem para compressão.'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Canvas context não disponível.'));
            return;
          }
          
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Falha na conversão da imagem.'));
                return;
              }
              resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            },
            'image/jpeg',
            quality
          );
        } catch (error) {
          reject(new Error(`Erro ao processar imagem: ${error.message}`));
        }
      };
      img.src = event.target.result;
    };
    reader.onerror = error => reject(new Error(`Erro ao ler arquivo: ${error.message || 'Erro desconhecido'}`));
  });
};

const ReportModal = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({ title: '', description: '', category: '', address: '', location: null, photos: [], videos: [] });
  const { toast } = useToast();
  const { user } = useAuth();
  const photoGalleryInputRef = useRef(null);
  const photoCameraInputRef = useRef(null);
  const videoGalleryInputRef = useRef(null);
  const videoCameraInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Solicita a geolocalização ao montar o componente
    if (!navigator.geolocation) {
      console.warn("Geolocalização não é suportada pelo navegador");
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({ 
          ...prev, 
          location: { lat: latitude, lng: longitude }
        }));
      },
      (error) => {
        console.warn("Não foi possível obter a geolocalização:", error.message);
        // Usar coordenadas padrão de Floresta-PE como fallback [lat, lng]
        const defaultLocation = { lat: FLORESTA_COORDS[0], lng: FLORESTA_COORDS[1] };
        setFormData(prev => ({ 
          ...prev, 
          location: prev.location || defaultLocation
        }));
      },
      geoOptions
    );

    // Cleanup: não há nada a limpar para getCurrentPosition, mas mantemos a estrutura para consistência
    return () => {
      // getCurrentPosition não retorna um ID, então não há nada a limpar
    };
  }, []);

  // Cleanup de previews de imagens quando o componente desmontar
  useEffect(() => {
    return () => {
      // Limpar todos os previews ao desmontar
      formData.photos.forEach(photo => {
        if (photo?.preview) {
          URL.revokeObjectURL(photo.preview);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executar apenas na desmontagem

  const categories = [
    { id: 'iluminacao', name: 'Iluminação', icon: '💡' },
    { id: 'buracos', name: 'Buracos na Via', icon: '🕳️' },
    { id: 'esgoto', name: 'Esgoto Entupido', icon: '🚰' },
    { id: 'limpeza', name: 'Limpeza Urbana', icon: '🧹' },
    { id: 'poda', name: 'Poda de Árvore', icon: '🌳' },
    { id: 'vazamento-de-agua', name: 'Vazamento de Água', icon: '💧' },
    { id: 'outros', name: 'Outros', icon: '📍' }
  ];

  const handleFileChange = async (e, fileType) => {
    const files = Array.from(e.target.files);
    
    // Validação de tipos MIME
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    
    for (const file of files) {
      // Validação de tipo MIME
      if (fileType === 'photos' && !validImageTypes.includes(file.type)) {
        toast({ 
          title: "Tipo de arquivo inválido!", 
          description: "Por favor, selecione apenas imagens (JPEG, PNG, WEBP ou GIF).", 
          variant: "destructive" 
        });
        continue;
      }
      if (fileType === 'videos' && !validVideoTypes.includes(file.type)) {
        toast({ 
          title: "Tipo de arquivo inválido!", 
          description: "Por favor, selecione apenas vídeos (MP4, MOV ou WEBM).", 
          variant: "destructive" 
        });
        continue;
      }
      
      // Validação de tamanho
      if (fileType === 'photos' && file.size > 10 * 1024 * 1024) { // 10MB limit for photos
        toast({ 
          title: "Imagem muito grande!", 
          description: "Por favor, selecione uma imagem com menos de 10MB.", 
          variant: "destructive" 
        });
        continue;
      }
      if (fileType === 'videos' && file.size > 50 * 1024 * 1024) { // 50MB limit for videos
        toast({ 
          title: "Vídeo muito grande!", 
          description: "Por favor, selecione um vídeo com menos de 50MB.", 
          variant: "destructive" 
        });
        continue;
      }

      try {
        let processedFile = file;
        if (fileType === 'photos') {
          processedFile = await compressImage(file);
        }
        
        setFormData(prev => ({
          ...prev,
          [fileType]: [...prev[fileType], { file: processedFile, name: processedFile.name, preview: fileType === 'photos' ? URL.createObjectURL(processedFile) : null }]
        }));
        
      } catch (error) {
        console.error("Error processing file:", error);
        toast({ 
          title: "Erro ao processar arquivo", 
          description: error.message || "Não foi possível carregar o arquivo selecionado.", 
          variant: "destructive" 
        });
      }
    }
    e.target.value = null;
  };

  const removeFile = (fileType, index) => {
    setFormData(prev => {
      const fileToRemove = prev[fileType][index];
      // Revogar URL de preview se existir
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      const newFiles = [...prev[fileType]];
      newFiles.splice(index, 1);
      return {
        ...prev,
        [fileType]: newFiles
      };
    });
  };

  const uploadMedia = async (reportId) => {
    const mediaToUpload = [
      ...formData.photos.map(p => ({ ...p, type: 'photo' })),
      ...formData.videos.map(v => ({ ...v, type: 'video' }))
    ];
    
    if (mediaToUpload.length === 0) return { success: true };

    const uploadResults = [];
    const errors = [];

    // Processar uploads um por um para melhor controle de erros
    for (const media of mediaToUpload) {
      try {
        const filePath = `${user.id}/${reportId}/${Date.now()}-${media.name}`;
        const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, media.file);

        if (uploadError) {
          errors.push(`Erro no upload de ${media.name}: ${uploadError.message}`);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
        
        uploadResults.push({
          report_id: reportId,
          url: publicUrl,
          type: media.type,
          name: media.name,
        });
      } catch (error) {
        errors.push(`Erro ao processar ${media.name}: ${error.message}`);
      }
    }

    // Inserir apenas os uploads bem-sucedidos
    if (uploadResults.length > 0) {
      const { error: insertError } = await supabase.from('report_media').insert(uploadResults);
      if (insertError) {
        errors.push(`Erro ao salvar mídia no banco: ${insertError.message}`);
      }
    }

    // Se houve erros, mostrar notificação
    if (errors.length > 0) {
      toast({ 
        title: "Erro no Upload de Mídia", 
        description: errors.join('; '), 
        variant: "destructive" 
      });
      return { success: false, errors };
    }

    return { success: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validações
    if (!formData.title || !formData.category) {
      toast({ title: "Campos obrigatórios", description: "Por favor, preencha título e categoria.", variant: "destructive" });
      return;
    }
    if (!formData.location) {
      toast({ title: "Localização Obrigatória", description: "Por favor, marque o local da bronca no mapa.", variant: "destructive" });
      return;
    }
    if (!formData.address || formData.address.trim() === '') {
      toast({ title: "Endereço Obrigatório", description: "Por favor, preencha o endereço de referência.", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Criar wrapper para uploadMedia que retorna erro se houver falha crítica
      const uploadMediaWrapper = async (reportId) => {
        const result = await uploadMedia(reportId);
        // Se houver erros críticos (nenhum arquivo foi enviado quando deveria), lançar erro
        if (!result.success && formData.photos.length + formData.videos.length > 0 && result.errors?.length === formData.photos.length + formData.videos.length) {
          throw new Error('Falha ao fazer upload de todos os arquivos. A bronca será criada sem mídia.');
        }
        return result;
      };

      await onSubmit(formData, uploadMediaWrapper);
      
      // Limpar previews de imagens após sucesso
      formData.photos.forEach(photo => {
        if (photo.preview) {
          URL.revokeObjectURL(photo.preview);
        }
      });
      
      // Resetar formulário
      setFormData({ 
        title: '', 
        description: '', 
        category: '', 
        address: '', 
        location: null, 
        photos: [], 
        videos: [] 
      });
      
      // Fechar modal apenas em caso de sucesso
      onClose();
    } catch (error) {
      console.error("Erro ao submeter formulário:", error);
      toast({ 
        title: "Erro ao criar bronca", 
        description: error.message || "Ocorreu um erro ao processar sua solicitação. Tente novamente.", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLocationChange = (newLocation) => {
    setFormData(prev => ({ ...prev, location: newLocation }));
  };

  const handleClose = () => {
    // Não permitir fechar durante o envio
    if (isSubmitting) {
      return;
    }
    
    // Limpar previews antes de fechar
    formData.photos.forEach(photo => {
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
      }
    });
    // Resetar formulário
    setFormData({ 
      title: '', 
      description: '', 
      category: '', 
      address: '', 
      location: null, 
      photos: [], 
      videos: [] 
    });
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[1200]" onClick={handleClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold gradient-text">Nova Bronca</h2>
            <button 
              onClick={handleClose} 
              className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              aria-label="Fechar modal"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-muted-foreground mt-1">Cadastre um problema em Floresta-PE</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">Título da Bronca *</label>
              <span className="text-xs text-muted-foreground">{formData.title.length}/65</span>
            </div>
            <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} maxLength="65" className="w-full bg-background px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Ex: Buraco na Rua Principal" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Categoria *</label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {categories.map((c) => (
                <button key={c.id} type="button" onClick={() => setFormData({ ...formData, category: c.id })} className={`p-3 rounded-lg border-2 transition-all text-center ${formData.category === c.id ? 'border-primary bg-primary/10' : 'border-border hover:border-accent'}`}>
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-xs font-medium">{c.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">Descrição</label>
              <span className="text-xs text-muted-foreground">{formData.description.length}/2000</span>
            </div>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} maxLength="2000" rows={4} className="w-full bg-background px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Descreva detalhadamente o problema..." />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"><MapPin className="w-4 h-4" /> Localização *</label>
            <p className="text-xs text-muted-foreground mb-2">Ajuste o marcador para o local exato da bronca.</p>
            <div className="h-64 w-full rounded-lg overflow-hidden border border-input">
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={formData.location} />
              </Suspense>
            </div>
            <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full bg-background px-4 py-3 border border-input rounded-lg mt-3 focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Endereço de referência (ex: Rua da Floresta, 123)" required />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">Mídia</label>
              {(formData.photos.length > 0 || formData.videos.length > 0) && (
                <span className="text-xs text-muted-foreground">
                  {formData.photos.length} foto{formData.photos.length !== 1 ? 's' : ''} • {formData.videos.length} vídeo{formData.videos.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="file" 
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" 
                  multiple 
                  onChange={(e) => handleFileChange(e, 'photos')} 
                  ref={photoGalleryInputRef} 
                  className="hidden" 
                  disabled={isSubmitting}
                />
                <input 
                  type="file" 
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" 
                  capture="environment" 
                  onChange={(e) => handleFileChange(e, 'photos')} 
                  ref={photoCameraInputRef} 
                  className="hidden" 
                  disabled={isSubmitting}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => photoCameraInputRef.current?.click()} 
                  className="h-20 flex-col gap-1"
                  disabled={isSubmitting}
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-xs">Tirar Foto</span>
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => photoGalleryInputRef.current?.click()} 
                  className="h-20 flex-col gap-1"
                  disabled={isSubmitting}
                >
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-xs">Galeria de Fotos</span>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="file" 
                  accept="video/mp4,video/quicktime,video/webm" 
                  multiple 
                  onChange={(e) => handleFileChange(e, 'videos')} 
                  ref={videoGalleryInputRef} 
                  className="hidden" 
                  disabled={isSubmitting}
                />
                <input 
                  type="file" 
                  accept="video/mp4,video/quicktime,video/webm" 
                  capture="environment" 
                  onChange={(e) => handleFileChange(e, 'videos')} 
                  ref={videoCameraInputRef} 
                  className="hidden" 
                  disabled={isSubmitting}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => videoCameraInputRef.current?.click()} 
                  className="h-20 flex-col gap-1"
                  disabled={isSubmitting}
                >
                  <Video className="w-6 h-6" />
                  <span className="text-xs">Gravar Vídeo</span>
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => videoGalleryInputRef.current?.click()} 
                  className="h-20 flex-col gap-1"
                  disabled={isSubmitting}
                >
                  <Film className="w-6 h-6" />
                  <span className="text-xs">Galeria de Vídeos</span>
                </Button>
              </div>
            </div>
            
            {(formData.photos.length > 0 || formData.videos.length > 0) && (
              <div className="mt-4 space-y-3">
                {formData.photos.map((media, index) => (
                  <div key={`photo-${index}`} className="flex items-center justify-between bg-background p-2 rounded-md border">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {media.preview && (
                        <img 
                          src={media.preview} 
                          alt={media.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <p className="text-xs text-muted-foreground truncate flex-1">{media.name}</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => removeFile('photos', index)} 
                      className="text-muted-foreground hover:text-destructive p-1 ml-2"
                      aria-label="Remover foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {formData.videos.map((media, index) => (
                  <div key={`video-${index}`} className="flex items-center justify-between bg-background p-2 rounded-md border">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Video className="w-12 h-12 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground truncate flex-1">{media.name}</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => removeFile('videos', index)} 
                      className="text-muted-foreground hover:text-destructive p-1 ml-2"
                      aria-label="Remover vídeo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose} 
              className="flex-1" 
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-primary hover:bg-primary/90" 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enviando...' : 'Cadastrar Bronca'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ReportModal;