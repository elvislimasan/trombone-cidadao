import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Plus, Trash2, Edit2, Save, X, Image as ImageIcon, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PetitionUpdatesManager = ({ petitionId }) => {
  const { toast } = useToast();
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [notifySigners, setNotifySigners] = useState(true);
  const [currentUpdate, setCurrentUpdate] = useState({
    title: '',
    content: '',
    image_url: ''
  });

  const safeFormatDate = (dateStr) => {
    try {
      if (!dateStr) return '';
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, [petitionId]);

  const fetchUpdates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('petition_updates')
      .select('*')
      .eq('petition_id', petitionId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar novidades", description: error.message, variant: "destructive" });
    } else {
      setUpdates(data || []);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!currentUpdate.title || !currentUpdate.content) {
      toast({ title: "Preencha título e conteúdo", variant: "destructive" });
      return;
    }

    try {
      let savedUpdateId = currentUpdate.id;

      if (currentUpdate.id) {
        // Update
        const { error } = await supabase
          .from('petition_updates')
          .update({
            title: currentUpdate.title,
            content: currentUpdate.content,
            image_url: currentUpdate.image_url
          })
          .eq('id', currentUpdate.id);
        
        if (error) throw error;
      } else {
        // Insert
        const { data, error } = await supabase
          .from('petition_updates')
          .insert({
            petition_id: petitionId,
            title: currentUpdate.title,
            content: currentUpdate.content,
            image_url: currentUpdate.image_url
          })
          .select()
          .single();
        
        if (error) throw error;
        savedUpdateId = data.id;
      }

      toast({ title: "Novidade salva com sucesso!" });

      // Trigger Notification if requested and it's a new update (or user explicitly wants to send on edit?)
      // Usually only on creation or explicit action.
      // For now, if notifySigners is true and we have an ID (which we do), we send.
      // But maybe restrict to only new updates? 
      // The user said "Quando eu criar uma novidade...". 
      // I'll restrict to !currentUpdate.id (Creation) OR maybe add a button "Send Notification" separately?
      // Let's stick to "On Creation" if checkbox is checked.
      
      if (!currentUpdate.id && notifySigners && savedUpdateId) {
          toast({ title: "Enviando notificações..." });
          try {
            await supabase.functions.invoke('send-news-email', {
                body: { 
                    newsId: null,
                    petitionUpdateId: savedUpdateId
                }
            });
            toast({ title: "Notificações enviadas!" });
          } catch (notifyError) {
            console.error('Error sending notifications:', notifyError);
            toast({ title: "Erro ao enviar notificações", description: "A novidade foi salva, mas os emails falharam.", variant: "warning" });
          }
      }

      setIsEditing(false);
      setCurrentUpdate({ title: '', content: '', image_url: '' });
      setNotifySigners(true);
      fetchUpdates();
    } catch (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Tem certeza que deseja excluir esta novidade?")) return;

    const { error } = await supabase
      .from('petition_updates')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Novidade excluída" });
      fetchUpdates();
    }
  };

  const startEdit = (update) => {
    setCurrentUpdate(update);
    setIsEditing(true);
    setNotifySigners(false); // Default to false on edit to avoid accidental resend
  };

  const startNew = () => {
    setCurrentUpdate({ title: '', content: '', image_url: '' });
    setIsEditing(true);
    setNotifySigners(true); // Default to true on new
  };

  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{currentUpdate.id ? 'Editar Novidade' : 'Nova Novidade'}</CardTitle>
          <CardDescription>Mantenha seus apoiadores informados sobre o progresso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <Input 
              value={currentUpdate.title} 
              onChange={e => setCurrentUpdate({...currentUpdate, title: e.target.value})}
              placeholder="Ex: Chegamos a 1000 assinaturas!" 
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Conteúdo</label>
            <Textarea 
              value={currentUpdate.content} 
              onChange={e => setCurrentUpdate({...currentUpdate, content: e.target.value})}
              placeholder="Escreva os detalhes da novidade..." 
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">URL da Imagem (Opcional)</label>
            <Input 
              value={currentUpdate.image_url || ''} 
              onChange={e => setCurrentUpdate({...currentUpdate, image_url: e.target.value})}
              placeholder="https://..." 
            />
          </div>

          {!currentUpdate.id && (
              <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                      id="notify" 
                      checked={notifySigners} 
                      onCheckedChange={setNotifySigners} 
                  />
                  <label 
                      htmlFor="notify" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                      Enviar notificação por email para os apoiadores
                  </label>
              </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> Salvar
            </Button>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              <X className="w-4 h-4 mr-2" /> Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Novidades da Campanha</CardTitle>
          <CardDescription>Gerencie as atualizações exibidas na página.</CardDescription>
        </div>
        <Button onClick={startNew}>
          <Plus className="w-4 h-4 mr-2" /> Nova Novidade
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p>Carregando...</p>
        ) : updates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <p>Nenhuma novidade publicada ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map(update => (
              <div key={update.id} className="flex items-start justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                <div className="space-y-1">
                  <h4 className="font-semibold">{update.title}</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">{update.content}</p>
                  <p className="text-xs text-muted-foreground pt-2">
                    {safeFormatDate(update.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(update)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(update.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PetitionUpdatesManager;
