import React, { useState, useRef, lazy, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, Video, Trash2, MapPin, Image as ImageIcon, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const compressImage = (file, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob conversion failed.'));
              return;
            }
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          },
          'image/jpeg',
          quality
        );
      };
    };
    reader.onerror = error => reject(error);
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({ ...prev, location: { lat: latitude, lng: longitude }}));
      },
      (error) => {
        console.warn("Não foi possível obter a geolocalização:", error.message);
      }
    );
  }, []);

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
    
    for (const file of files) {
      if (fileType === 'photos' && file.size > 10 * 1024 * 1024) { // 10MB limit for photos
        toast({ title: "Imagem muito grande!", description: "Por favor, selecione uma imagem com menos de 10MB.", variant: "destructive" });
        continue;
      }
      if (fileType === 'videos' && file.size > 50 * 1024 * 1024) { // 50MB limit for videos
        toast({ title: "Vídeo muito grande!", description: "Por favor, selecione um vídeo com menos de 50MB.", variant: "destructive" });
        continue;
      }

      try {
        let processedFile = file;
        if (fileType === 'photos') {
          processedFile = await compressImage(file);
        }
        
        setFormData(prev => ({
          ...prev,
          [fileType]: [...prev[fileType], { file: processedFile, name: processedFile.name }]
        }));
        
      } catch (error) {
        console.error("Error processing file:", error);
        toast({ title: "Erro ao processar arquivo", description: "Não foi possível carregar o arquivo selecionado.", variant: "destructive" });
      }
    }
    e.target.value = null;
  };

  const removeFile = (fileType, index) => {
    setFormData(prev => ({
      ...prev,
      [fileType]: prev[fileType].filter((_, i) => i !== index)
    }));
  };

  const uploadMedia = async (reportId) => {
    const mediaToUpload = [
      ...formData.photos.map(p => ({ ...p, type: 'photo' })),
      ...formData.videos.map(v => ({ ...v, type: 'video' }))
    ];
    
    if (mediaToUpload.length === 0) return;

    const uploadPromises = mediaToUpload.map(async (media) => {
      const filePath = `${user.id}/${reportId}/${Date.now()}-${media.name}`;
      const { error: uploadError } = await supabase.storage.from('reports-media').upload(filePath, media.file);

      if (uploadError) {
        throw new Error(`Erro no upload de ${media.name}: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
      
      return {
        report_id: reportId,
        url: publicUrl,
        type: media.type,
        name: media.name,
      };
    });

    try {
      const uploadedMedia = await Promise.all(uploadPromises);
      
      if (uploadedMedia.length > 0) {
        const { error: insertError } = await supabase.from('report_media').insert(uploadedMedia);
        if (insertError) {
          throw new Error(`Erro ao salvar mídia no banco: ${insertError.message}`);
        }
      }
    } catch (error) {
       toast({ title: "Erro no Upload de Mídia", description: error.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.category) {
      toast({ title: "Campos obrigatórios", description: "Por favor, preencha título e categoria.", variant: "destructive" });
      return;
    }
     if (!formData.location) {
      toast({ title: "Localização Obrigatória", description: "Por favor, marque o local da bronca no mapa.", variant: "destructive" });
      return;
    }
    if (!formData.address) {
      toast({ title: "Endereço Obrigatório", description: "Por favor, preencha o endereço de referência.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    await onSubmit(formData, uploadMedia);
    setIsSubmitting(false);
    onClose();
  };

  const handleLocationChange = (newLocation) => {
    setFormData({ ...formData, location: newLocation });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[1200]" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold gradient-text">Nova Bronca</h2>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"><X className="w-5 h-5" /></button>
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
            <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Localização *</label>
            <p className="text-xs text-muted-foreground mb-2">Ajuste o marcador para o local exato da bronca.</p>
            <div className="h-64 w-full rounded-lg overflow-hidden border border-input">
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={formData.location} />
              </Suspense>
            </div>
            <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full bg-background px-4 py-3 border border-input rounded-lg mt-3 focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Endereço de referência (ex: Rua da Floresta, 123)" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Mídia</label>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="file" accept="image/*" multiple onChange={(e) => handleFileChange(e, 'photos')} ref={photoGalleryInputRef} className="hidden" />
                <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'photos')} ref={photoCameraInputRef} className="hidden" />
                <Button type="button" variant="outline" onClick={() => photoCameraInputRef.current.click()} className="h-20 flex-col gap-1"><Camera className="w-6 h-6" /><span className="text-xs">Tirar Foto</span></Button>
                <Button type="button" variant="outline" onClick={() => photoGalleryInputRef.current.click()} className="h-20 flex-col gap-1"><ImageIcon className="w-6 h-6" /><span className="text-xs">Galeria de Fotos</span></Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="file" accept="video/mp4,video/quicktime" multiple onChange={(e) => handleFileChange(e, 'videos')} ref={videoGalleryInputRef} className="hidden" />
                <input type="file" accept="video/mp4,video/quicktime" capture="environment" onChange={(e) => handleFileChange(e, 'videos')} ref={videoCameraInputRef} className="hidden" />
                <Button type="button" variant="outline" onClick={() => videoCameraInputRef.current.click()} className="h-20 flex-col gap-1"><Video className="w-6 h-6" /><span className="text-xs">Gravar Vídeo</span></Button>
                <Button type="button" variant="outline" onClick={() => videoGalleryInputRef.current.click()} className="h-20 flex-col gap-1"><Film className="w-6 h-6" /><span className="text-xs">Galeria de Vídeos</span></Button>
              </div>
            </div>
            
            {(formData.photos.length > 0 || formData.videos.length > 0) && (
              <div className="mt-4 space-y-3">
                {[...formData.photos, ...formData.videos].map((media, index) => (
                  <div key={index} className="flex items-center justify-between bg-background p-2 rounded-md border">
                    <p className="text-xs text-muted-foreground truncate">{media.name}</p>
                    <button type="button" onClick={() => removeFile(media.file.type.startsWith('image') ? 'photos' : 'videos', index)} className="text-muted-foreground hover:text-primary p-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Cadastrar Bronca'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ReportModal;