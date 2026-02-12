import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Send, Image as ImageIcon, X, Loader2 } from 'lucide-react';

const PetitionUpdateModal = ({ isOpen, onClose, petitionId, onSave }) => {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [notifySigners, setNotifySigners] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image_url: ''
  });

  const handleClose = () => {
    setFormData({ title: '', content: '', image_url: '' });
    setNotifySigners(true);
    onClose();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Arquivo inválido", description: "Por favor, selecione uma imagem.", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    try {
      // Compressão simples usando Canvas
      const compressedFile = await compressImage(file);
      
      const fileExt = compressedFile.name.split('.').pop();
      const fileName = `${petitionId}/${Date.now()}.${fileExt}`;
      const filePath = `updates/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('petition-images')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('petition-images')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      toast({ title: "Imagem enviada!" });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Redimensionar se for muito grande (max 1200px)
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          }, 'image/webp', 0.8);
        };
      };
    });
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast({ title: "Preencha título e conteúdo", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Insert
      const { data, error } = await supabase
        .from('petition_updates')
        .insert({
          petition_id: petitionId,
          title: formData.title,
          content: formData.content,
          image_url: formData.image_url
        })
        .select()
        .single();
      
      if (error) throw error;

      toast({ title: "Novidade publicada com sucesso!" });

      // Trigger Notification
      if (notifySigners && data) {
          toast({ title: "Enviando notificações..." });
          try {
            await supabase.functions.invoke('send-news-email', {
                body: { 
                    newsId: null,
                    petitionUpdateId: data.id
                }
            });
            toast({ title: "Notificações enviadas!" });
          } catch (notifyError) {
            console.error('Error sending notifications:', notifyError);
            toast({ title: "Erro ao enviar notificações", description: "A novidade foi salva, mas os emails falharam.", variant: "warning" });
          }
      }

      if (onSave) onSave();
      handleClose();
    } catch (error) {
      console.error('Error saving update:', error);
      toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nova Novidade</DialogTitle>
          <DialogDescription>
            Mantenha seus apoiadores informados sobre o progresso desta campanha.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <Input 
              value={formData.title} 
              onChange={e => setFormData({...formData, title: e.target.value})}
              placeholder="Ex: Chegamos a 1000 assinaturas!" 
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Conteúdo</label>
            <Textarea 
              value={formData.content} 
              onChange={e => setFormData({...formData, content: e.target.value})}
              placeholder="Escreva os detalhes da novidade..." 
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Imagem (Opcional)</label>
            <div className="flex flex-col gap-3">
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  className="hidden" 
                />
                
                {!formData.image_url ? (
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full border-dashed h-24 flex flex-col gap-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
                    onClick={() => fileInputRef.current.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-xs font-medium">Enviando...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Clique para fazer upload da imagem</span>
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="relative group rounded-xl overflow-hidden border bg-muted aspect-video max-h-48">
                    <img 
                      src={formData.image_url} 
                      alt="Preview" 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        type="button" 
                        variant="destructive" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                      >
                        <X className="w-4 h-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                )}
                
                <p className="text-[10px] text-muted-foreground text-center">
                  Recomendado: 1200x675px (16:9). Formatos: JPG, PNG, WEBP.
                </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2 bg-muted/50 p-3 rounded-lg">
            <Checkbox 
                id="notify" 
                checked={notifySigners} 
                onCheckedChange={setNotifySigners} 
            />
            <div className="grid gap-1.5 leading-none">
                <label 
                    htmlFor="notify" 
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                    Notificar apoiadores por email
                </label>
                <p className="text-xs text-muted-foreground">
                    Envia um email para todos que assinaram e permitiram notificações.
                </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            <Send className="w-4 h-4" />
            {loading ? 'Publicando...' : 'Publicar Novidade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PetitionUpdateModal;
