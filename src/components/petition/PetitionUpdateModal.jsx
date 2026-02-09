import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Send, Image as ImageIcon } from 'lucide-react';

const PetitionUpdateModal = ({ isOpen, onClose, petitionId, onSave }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
            <label className="text-sm font-medium">URL da Imagem (Opcional)</label>
            <div className="flex gap-2">
                <Input 
                value={formData.image_url || ''} 
                onChange={e => setFormData({...formData, image_url: e.target.value})}
                placeholder="https://..." 
                />
                {formData.image_url && (
                    <div className="w-10 h-10 relative rounded overflow-hidden border">
                        <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                )}
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
