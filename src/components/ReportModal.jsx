import React, { useState, useRef, lazy, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, Video, Trash2, MapPin, Image as ImageIcon, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
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
  const [formData, setFormData] = useState({ title: '', description: '', category: '', address: '', location: null, photos: [], videos: [], pole_number: '' });
  const [errors, setErrors] = useState({});
  const { toast } = useToast();
  const { user } = useAuth();
  const photoGalleryInputRef = useRef(null);
  const photoCameraInputRef = useRef(null);
  const videoGalleryInputRef = useRef(null);
  const videoCameraInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false); // Flag para indicar que está tirando foto

  useEffect(() => {
    // Solicita a geolocalização ao montar o componente
    if (!navigator.geolocation) {
      // Geolocalização não é suportada pelo navegador
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
        // Não foi possível obter a geolocalização
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

  // Listener para quando o app volta ao foreground (para preservar o estado quando a câmera é aberta)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let appStateListener = null;

    const setupAppStateListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        appStateListener = await App.addListener('appStateChange', async ({ isActive }) => {
          // Quando o app volta ao foreground após tirar foto, garantir que o estado seja preservado
          if (isActive && isTakingPhoto) {
            console.log('App voltou ao foreground durante captura de foto');
            // Aguardar um pouco para garantir que a câmera terminou
            setTimeout(() => {
              setIsTakingPhoto(false);
            }, 1000);
          }
        });
      } catch (error) {
        console.error('Erro ao configurar listener de app state:', error);
      }
    };

    setupAppStateListener();

    return () => {
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [isTakingPhoto]);

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
        
        // Limpar erro de fotos se houver
        if (fileType === 'photos' && errors.photos) {
          setErrors(prev => ({ ...prev, photos: undefined }));
        }
        
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

  // Função para converter base64/URL em File object
  const base64ToFile = async (base64String, fileName, mimeType) => {
    // Se for uma URL (webPath do Capacitor), buscar como blob
    if (base64String.startsWith('http://') || base64String.startsWith('https://') || base64String.startsWith('file://')) {
      try {
        const response = await fetch(base64String);
        const blob = await response.blob();
        return new File([blob], fileName, { type: mimeType });
      } catch (error) {
        throw new Error('Erro ao carregar imagem da câmera');
      }
    }
    
    // Se for base64 data URL
    const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], fileName, { type: mimeType });
  };

  // Função para tirar foto usando a câmera nativa ou web
  const handleTakePhoto = async () => {
    // Marcar que está tirando foto para evitar que o modal feche
    setIsTakingPhoto(true);
    
    try {
      // Verificar se está no app nativo
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera')) {
        // Usar câmera nativa do Capacitor
        // Usar Base64 para melhor compatibilidade e evitar problemas com webPath
        const image = await CapacitorCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64, // Usar Base64 para garantir que a imagem seja capturada
          source: CameraSource.Camera, // IMPORTANTE: Forçar câmera, não galeria
          correctOrientation: true,
          saveToGallery: false,
        });

        // Converter a foto em File object
        const timestamp = Date.now();
        const fileName = `photo_${timestamp}.jpg`;
        
        let photoFile;
        
        // Priorizar base64String (mais confiável)
        if (image.base64String) {
          photoFile = await base64ToFile(`data:image/jpeg;base64,${image.base64String}`, fileName, 'image/jpeg');
        } else if (image.dataUrl) {
          // Fallback: usar dataUrl se disponível
          photoFile = await base64ToFile(image.dataUrl, fileName, 'image/jpeg');
        } else if (image.webPath) {
          // Fallback: tentar usar webPath
          try {
            // Buscar a imagem usando fetch
            const response = await fetch(image.webPath);
            if (!response.ok) {
              throw new Error('Erro ao carregar imagem da câmera');
            }
            const blob = await response.blob();
            photoFile = new File([blob], fileName, { type: 'image/jpeg', lastModified: timestamp });
          } catch (fetchError) {
            console.error('Erro ao buscar webPath:', fetchError);
            // Tentar usar Capacitor.convertFileSrc se fetch falhar
            try {
              const convertedPath = Capacitor.convertFileSrc(image.webPath);
              const response = await fetch(convertedPath);
              const blob = await response.blob();
              photoFile = new File([blob], fileName, { type: 'image/jpeg', lastModified: timestamp });
            } catch (convertError) {
              console.error('Erro ao converter webPath:', convertError);
              throw new Error('Não foi possível processar a imagem da câmera');
            }
          }
        } else if (image.path) {
          // Fallback: tentar ler do filesystem
          try {
            const fileData = await Filesystem.readFile({
              path: image.path,
              directory: Directory.Data,
            });
            photoFile = await base64ToFile(`data:image/jpeg;base64,${fileData.data}`, fileName, 'image/jpeg');
          } catch (fsError) {
            console.error('Erro ao ler do filesystem:', fsError);
            throw new Error('Não foi possível processar a imagem da câmera');
          }
        } else {
          throw new Error('Formato de imagem não suportado. Nenhum dado de imagem foi retornado.');
        }

        // Processar e adicionar a foto
        try {
          const compressedFile = await compressImage(photoFile);
          
          // Garantir que o estado seja atualizado corretamente
          setFormData(prev => {
            const newPhotos = [...prev.photos, { 
              file: compressedFile, 
              name: compressedFile.name, 
              preview: URL.createObjectURL(compressedFile) 
            }];
            
            console.log('Foto adicionada ao estado. Total de fotos:', newPhotos.length);
            
            return {
              ...prev,
              photos: newPhotos
            };
          });
          
          // Limpar erro de fotos se houver
          if (errors.photos) {
            setErrors(prev => ({ ...prev, photos: undefined }));
          }
          
          // Aguardar um pouco para garantir que o estado foi atualizado
          await new Promise(resolve => setTimeout(resolve, 100));
          
          toast({ 
            title: "Foto adicionada! 📸", 
            description: "A foto foi capturada e anexada com sucesso." 
          });
        } catch (error) {
          console.error("Error processing photo:", error);
          toast({ 
            title: "Erro ao processar foto", 
            description: error.message || "Não foi possível processar a foto capturada.", 
            variant: "destructive" 
          });
        }
      } else {
        // No web, usar input file com capture
        photoCameraInputRef.current?.click();
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      // Se o usuário cancelar, não mostrar erro
      const errorMessage = error.message || error.toString();
      if (!errorMessage.includes('cancel') && !errorMessage.includes('Cancelled') && !errorMessage.includes('User cancelled')) {
        toast({ 
          title: "Erro ao abrir câmera", 
          description: "Não foi possível abrir a câmera. Tente novamente ou selecione uma foto da galeria.", 
          variant: "destructive" 
        });
      }
    } finally {
      // Sempre resetar a flag quando terminar (sucesso ou erro)
      setIsTakingPhoto(false);
    }
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
    
    // Limpar erros anteriores
    const newErrors = {};
    let hasErrors = false;
    
    // Validações
    if (!formData.title || !formData.category) {
      if (!formData.title) newErrors.title = "Por favor, preencha o título da bronca.";
      if (!formData.category) newErrors.category = "Por favor, selecione uma categoria.";
      hasErrors = true;
    }
    if (!formData.location) {
      newErrors.location = "Por favor, marque o local da bronca no mapa.";
      hasErrors = true;
    }
    if (!formData.address || formData.address.trim() === '') {
      newErrors.address = "Por favor, preencha o endereço de referência.";
      hasErrors = true;
    }
    if (formData.photos.length === 0) {
      newErrors.photos = "Por favor, adicione pelo menos uma foto da bronca.";
      hasErrors = true;
    }
    if (formData.category === 'iluminacao' && (!formData.pole_number || formData.pole_number.trim() === '')) {
      newErrors.pole_number = "Por favor, informe o número do poste apagado.";
      hasErrors = true;
    }
    
    if (hasErrors) {
      setErrors(newErrors);
      // Fazer scroll para o primeiro erro
      const firstErrorField = Object.keys(newErrors)[0];
      const errorElement = document.querySelector(`[data-error-field="${firstErrorField}"]`);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorElement.focus();
      }
      return;
    }
    
    // Limpar erros se tudo estiver válido
    setErrors({});
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
        videos: [],
        pole_number: ''
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
    // Não permitir fechar durante o envio ou enquanto está tirando foto
    if (isSubmitting || isTakingPhoto) {
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
        videos: [],
        pole_number: ''
      });
      
      // Limpar erros
      setErrors({});
      
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
            <input 
              type="text" 
              value={formData.title} 
              onChange={(e) => {
                setFormData({ ...formData, title: e.target.value });
                if (errors.title) setErrors(prev => ({ ...prev, title: undefined }));
              }}
              data-error-field="title"
              maxLength="65" 
              className={`w-full bg-background px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${errors.title ? 'border-destructive' : 'border-input'}`}
              placeholder="Ex: Buraco na Rua Principal" 
              required 
            />
            {errors.title && (
              <p className="text-xs text-destructive mt-1">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Categoria *</label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {categories.map((c) => (
                <button 
                  key={c.id} 
                  type="button" 
                  data-error-field="category"
                  onClick={() => {
                    setFormData({ ...formData, category: c.id, pole_number: c.id !== 'iluminacao' ? '' : formData.pole_number });
                    if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
                  }} 
                  className={`p-3 rounded-lg border-2 transition-all text-center ${formData.category === c.id ? 'border-primary bg-primary/10' : errors.category ? 'border-destructive' : 'border-border hover:border-accent'}`}
                >
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-xs font-medium">{c.name}</div>
                </button>
              ))}
            </div>
            {errors.category && (
              <p className="text-xs text-destructive mt-1">{errors.category}</p>
            )}
          </div>

          {formData.category === 'iluminacao' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Número do Poste <span className="text-destructive">*</span>
              </label>
              <input 
                type="text" 
                value={formData.pole_number} 
                onChange={(e) => {
                  setFormData({ ...formData, pole_number: e.target.value });
                  if (errors.pole_number) setErrors(prev => ({ ...prev, pole_number: undefined }));
                }}
                data-error-field="pole_number"
                className={`w-full bg-background px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${errors.pole_number ? 'border-destructive' : 'border-input'}`}
                placeholder="Ex: 1234 ou P-5678" 
                required
              />
              {errors.pole_number ? (
                <p className="text-xs text-destructive mt-1">{errors.pole_number}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Informe o número identificador do poste apagado. Este número é essencial para a resolução do problema.</p>
              )}
            </div>
          )}

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
            <div data-error-field="location" className={`h-64 w-full rounded-lg overflow-hidden border ${errors.location ? 'border-destructive' : 'border-input'}`}>
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                <LocationPickerMap 
                  onLocationChange={(newLocation) => {
                    handleLocationChange(newLocation);
                    if (errors.location) setErrors(prev => ({ ...prev, location: undefined }));
                  }} 
                  initialPosition={formData.location} 
                />
              </Suspense>
            </div>
            {errors.location && (
              <p className="text-xs text-destructive mt-1">{errors.location}</p>
            )}
            <input 
              type="text" 
              value={formData.address} 
              onChange={(e) => {
                setFormData({ ...formData, address: e.target.value });
                if (errors.address) setErrors(prev => ({ ...prev, address: undefined }));
              }}
              data-error-field="address"
              className={`w-full bg-background px-4 py-3 border rounded-lg mt-3 focus:ring-2 focus:ring-primary focus:border-transparent ${errors.address ? 'border-destructive' : 'border-input'}`}
              placeholder="Endereço de referência (ex: Rua da Floresta, 123)" 
              required 
            />
            {errors.address && (
              <p className="text-xs text-destructive mt-1">{errors.address}</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">
                Mídia <span className="text-destructive">*</span>
              </label>
              {(formData.photos.length > 0 || formData.videos.length > 0) && (
                <span className="text-xs text-muted-foreground">
                  {formData.photos.length} foto{formData.photos.length !== 1 ? 's' : ''} • {formData.videos.length} vídeo{formData.videos.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {errors.photos && (
              <p className="text-xs text-destructive mb-2">{errors.photos}</p>
            )}
            {formData.photos.length === 0 && !errors.photos && (
              <p className="text-xs text-muted-foreground mb-2">Pelo menos uma foto é obrigatória</p>
            )}
            <div className="space-y-3" data-error-field="photos">
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
                  onClick={handleTakePhoto}
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